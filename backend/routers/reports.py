import os
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

import crud
import pdf as pdf_module
from auth import get_current_user, require_admin, require_staff
from database import UPLOAD_DIR, User, get_db
from email_utils import send_high_severity_email
from schemas import AssignRequest, ReportCreate, ReportOut, ReportUpdate, StatsOut, StatusLogOut
from ws_manager import manager

router = APIRouter(prefix="/reports", tags=["reports"])

ALLOWED_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp"},
    "video": {".mp4", ".mov", ".avi", ".webm"},
}


def _save_upload(file: UploadFile) -> tuple[str, str]:
    ext = os.path.splitext(file.filename or "")[1].lower()
    file_type: Optional[str] = None
    for ftype, exts in ALLOWED_EXTENSIONS.items():
        if ext in exts:
            file_type = ftype
            break
    if file_type is None:
        raise HTTPException(status_code=400, detail="許可されていないファイル形式です")
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = os.path.join(UPLOAD_DIR, filename)
    with open(dest, "wb") as f:
        f.write(file.file.read())
    return dest, file_type


# --- 統計 (固定パスは {report_id} より先に定義) ---
@router.get("/stats", response_model=StatsOut)
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id if current_user.role == "customer" else None
    return crud.get_stats(db, user_id=uid)


# --- 一覧取得 ---
@router.get("", response_model=list[ReportOut])
def list_reports(
    machine_name: Optional[str] = None,
    location: Optional[str] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "reported_at",
    sort_order: str = "desc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = None if current_user.role in ("admin", "maker") else current_user.id
    return crud.get_reports(
        db,
        machine_name=machine_name, location=location, status=status,
        severity=severity, date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_order=sort_order, user_id=uid,
    )


async def _broadcast_new_report(
    report_id: int, machine_name: str, location: str,
    severity: str, reported_at: str, recurrence_count: int,
):
    await manager.broadcast({
        "type": "new_report",
        "report": {
            "id": report_id,
            "machine_name": machine_name,
            "location": location,
            "severity": severity,
            "reported_at": reported_at,
            "recurrence_count": recurrence_count,
        },
    })


# --- 新規登録 (customer のみ) ---
@router.post("", response_model=ReportOut, status_code=201)
def create_report(
    background_tasks: BackgroundTasks,
    machine_name: str = Form(...),
    location: str = Form(...),
    description: str = Form(...),
    severity: str = Form("medium"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="報告の作成はユーザーのみ可能です")
    file_path: Optional[str] = None
    file_type: Optional[str] = None
    if file and file.filename:
        file_path, file_type = _save_upload(file)

    report = crud.create_report(
        db,
        ReportCreate(machine_name=machine_name, location=location, description=description, severity=severity),
        file_path=file_path, file_type=file_type, user_id=current_user.id,
    )
    recurrence = crud.get_recurrence_count(db, machine_name, report.id)

    background_tasks.add_task(
        _broadcast_new_report,
        report.id, report.machine_name, report.location, report.severity, report.reported_at, recurrence,
    )
    if severity == "high":
        background_tasks.add_task(
            send_high_severity_email,
            report.id, report.machine_name, report.location, report.description,
        )
    return report


# --- 単一取得 ---
@router.get("/{report_id}", response_model=ReportOut)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    crud.assert_report_owner(report, current_user.id, current_user.role)
    return report


# --- 報告内容編集 ---
@router.put("/{report_id}", response_model=ReportOut)
def update_report(
    report_id: int,
    machine_name: str = Form(...),
    location: str = Form(...),
    description: str = Form(...),
    severity: str = Form("medium"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    crud.assert_report_owner(report, current_user.id, current_user.role)

    file_path: Optional[str] = None
    file_type: Optional[str] = None
    if file and file.filename:
        file_path, file_type = _save_upload(file)

    return crud.update_report(
        db, report_id,
        ReportCreate(machine_name=machine_name, location=location, description=description, severity=severity),
        file_path=file_path, file_type=file_type,
    )


# --- ステータス更新 (staff: admin / maker) ---
@router.patch("/{report_id}", response_model=ReportOut)
def update_status(
    report_id: int,
    data: ReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    updated = crud.update_report_status(db, report_id, data, user_id=current_user.id)
    return updated


# --- 担当者アサイン (staff: admin / maker) ---
@router.patch("/{report_id}/assign", response_model=ReportOut)
def assign_report(
    report_id: int,
    data: AssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    assignee_name: Optional[str] = None
    if data.assignee_id is not None:
        assignee = db.query(User).filter(User.id == data.assignee_id).first()
        if not assignee:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        assignee_name = assignee.username
    report = crud.assign_report(db, report_id, data.assignee_id, assignee_name)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    return report


# --- ステータス変更ログ ---
@router.get("/{report_id}/status-logs", response_model=list[StatusLogOut])
def get_status_logs(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    crud.assert_report_owner(report, current_user.id, current_user.role)
    return crud.get_status_logs(db, report_id)


# --- 再発件数 ---
@router.get("/{report_id}/recurrence")
def get_recurrence(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    count = crud.get_recurrence_count(db, report.machine_name, report_id)
    return {"count": count, "machine_name": report.machine_name}


# --- 削除 (staff: admin / maker) ---
@router.delete("/{report_id}", status_code=204)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    if not crud.delete_report(db, report_id):
        raise HTTPException(status_code=404, detail="報告が見つかりません")


# --- PDF出力 ---
@router.get("/{report_id}/pdf")
def download_pdf(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    crud.assert_report_owner(report, current_user.id, current_user.role)
    pdf_bytes = pdf_module.generate_pdf(report)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=report_{report_id}.pdf"},
    )
