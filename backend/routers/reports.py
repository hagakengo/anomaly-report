import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

import crud
import pdf as pdf_module
from auth import get_current_user, require_admin
from database import UPLOAD_DIR, User, get_db
from schemas import ReportCreate, ReportOut, ReportUpdate

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


# --- 一覧取得 ---
@router.get("", response_model=list[ReportOut])
def list_reports(
    machine_name: Optional[str] = None,
    location: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # customerは自分の報告のみ、adminは全件
    uid = None if current_user.role == "admin" else current_user.id
    return crud.get_reports(db, machine_name=machine_name, location=location,
                            status=status, user_id=uid)


# --- 新規登録 (全ロール可) ---
@router.post("", response_model=ReportOut, status_code=201)
def create_report(
    machine_name: str = Form(...),
    location: str = Form(...),
    description: str = Form(...),
    severity: str = Form("medium"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_path: Optional[str] = None
    file_type: Optional[str] = None
    if file and file.filename:
        file_path, file_type = _save_upload(file)

    data = ReportCreate(
        machine_name=machine_name,
        location=location,
        description=description,
        severity=severity,
    )
    return crud.create_report(db, data, file_path=file_path, file_type=file_type,
                              user_id=current_user.id)


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


# --- 報告内容編集 (adminまたは自分の報告) ---
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

    data = ReportCreate(
        machine_name=machine_name,
        location=location,
        description=description,
        severity=severity,
    )
    updated = crud.update_report(db, report_id, data, file_path=file_path, file_type=file_type)
    return updated


# --- ステータス更新 (admin専用) ---
@router.patch("/{report_id}", response_model=ReportOut)
def update_status(
    report_id: int,
    data: ReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    report = crud.update_report_status(db, report_id, data)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    return report


# --- 削除 (admin専用) ---
@router.delete("/{report_id}", status_code=204)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not crud.delete_report(db, report_id):
        raise HTTPException(status_code=404, detail="報告が見つかりません")


# --- PDF出力 (adminまたは自分の報告) ---
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
