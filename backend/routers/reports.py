import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

import crud
import pdf as pdf_module
from database import UPLOAD_DIR, get_db
from schemas import ReportCreate, ReportOut, ReportUpdate

router = APIRouter(prefix="/reports", tags=["reports"])

ALLOWED_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp"},
    "video": {".mp4", ".mov", ".avi", ".webm"},
}


def _save_upload(file: UploadFile) -> tuple[str, str]:
    """ファイルを保存して (file_path, file_type) を返す。"""
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
):
    return crud.get_reports(db, machine_name=machine_name, location=location, status=status)


# --- 新規登録 ---
@router.post("", response_model=ReportOut, status_code=201)
def create_report(
    machine_name: str = Form(...),
    location: str = Form(...),
    description: str = Form(...),
    severity: str = Form("medium"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
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
    return crud.create_report(db, data, file_path=file_path, file_type=file_type)


# --- ステータス更新 ---
@router.patch("/{report_id}", response_model=ReportOut)
def update_status(
    report_id: int,
    data: ReportUpdate,
    db: Session = Depends(get_db),
):
    report = crud.update_report_status(db, report_id, data)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    return report


# --- 削除 ---
@router.delete("/{report_id}", status_code=204)
def delete_report(report_id: int, db: Session = Depends(get_db)):
    if not crud.delete_report(db, report_id):
        raise HTTPException(status_code=404, detail="報告が見つかりません")


# --- PDF出力 ---
@router.get("/{report_id}/pdf")
def download_pdf(report_id: int, db: Session = Depends(get_db)):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    pdf_bytes = pdf_module.generate_pdf(report)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=report_{report_id}.pdf"},
    )
