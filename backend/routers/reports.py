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

# 許可するファイル拡張子。セキュリティ上、サーバー側で必ずバリデーションする。
# フロントのバリデーションだけでは開発者ツールで簡単に回避できる。
ALLOWED_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp"},
    "video": {".mp4", ".mov", ".avi", ".webm"},
}


def _save_upload(file: UploadFile) -> tuple[str, str]:
    """アップロードファイルをサーバーのローカルストレージに保存する。
    ファイル名は uuid4 で生成したランダム文字列にする。
    元のファイル名をそのまま使うと、同名ファイルの上書きや
    パストラバーサル攻撃（"../../../etc/passwd" など）のリスクがある。"""
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


# ⚠ 固定パス（/stats）は パラメータパス（/{report_id}）より先に定義する必要がある。
# FastAPI はルートを上から順にマッチングするため、/{report_id} を先に書くと
# GET /reports/stats が report_id="stats" として処理されてしまう。
@router.get("/stats", response_model=StatsOut)
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """統計データを返す。customer は自分の報告だけ、admin/maker は全件が対象。"""
    uid = current_user.id if current_user.role == "customer" else None
    return crud.get_stats(db, user_id=uid)


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
    company_name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """フィルタ・ソート付き報告一覧。
    customer は自分の報告のみ（user_id を自動でセット）。
    admin / maker はすべての報告を取得できる（uid=None で全件）。
    company_name フィルタはメーカーが顧客別に絞り込む際に使う。"""
    uid = None if current_user.role in ("admin", "maker") else current_user.id
    return crud.get_reports(
        db,
        machine_name=machine_name, location=location, status=status,
        severity=severity, date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_order=sort_order, user_id=uid,
        company_name=company_name,
    )


async def _broadcast_new_report(
    report_id: int, machine_name: str, location: str,
    severity: str, reported_at: str, recurrence_count: int,
):
    """WebSocket で接続中の全クライアント（管理者・メーカー）に新規報告を通知する。
    非同期関数として定義し、BackgroundTasks で呼ぶことで
    レスポンスを返した後にブロードキャストが実行される（UX 改善）。"""
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


@router.post("", response_model=ReportOut, status_code=201)
def create_report(
    background_tasks: BackgroundTasks,
    machine_name: str = Form(...),
    location: str = Form(...),
    description: str = Form(...),
    severity: str = Form("medium"),
    file: Optional[UploadFile] = File(None),  # ファイルは任意（None OK）
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """新規報告を登録する（customer ロールのみ）。

    FormData を使う理由：JSON ではファイルを同時に送れない。
    multipart/form-data なら テキスト + ファイルを1リクエストで送れる。

    BackgroundTasks：
    - WebSocket ブロードキャストはレスポンス後に実行（非同期・ノンブロッキング）
    - severity=high のメール通知も同様（メール送信に数秒かかるため）
    """
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
        company_name=current_user.company_name,
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
    """報告内容を編集する。作成者のみ編集可能（assert_report_owner でチェック）。"""
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


@router.patch("/{report_id}", response_model=ReportOut)
def update_status(
    report_id: int,
    data: ReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),  # admin / maker のみ
):
    """ステータスを変更する（open → in_progress → resolved など）。
    PATCH を使う理由：PUT は全フィールドの更新、PATCH は一部フィールドの更新。
    ステータスだけを変えたいので PATCH が適切。"""
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    updated = crud.update_report_status(db, report_id, data, user_id=current_user.id)
    return updated


@router.patch("/{report_id}/assign", response_model=ReportOut)
def assign_report(
    report_id: int,
    data: AssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """担当者をアサインする。assignee_id=null でアサイン解除。
    アサイン時に assignee_name も確認・記録することで、
    一覧画面で担当者名を表示するたびに JOIN する必要をなくしている。"""
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


@router.get("/{report_id}/status-logs", response_model=list[StatusLogOut])
def get_status_logs(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """ステータス変更の履歴を返す。報告詳細画面のタイムラインに表示する。"""
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    crud.assert_report_owner(report, current_user.id, current_user.role)
    return crud.get_status_logs(db, report_id)


@router.get("/{report_id}/recurrence")
def get_recurrence(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """同じ機器の直近30日以内の報告件数を返す。
    2件以上なら「再発アラート」バッジを表示するためにフロントが使う。"""
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    count = crud.get_recurrence_count(db, report.machine_name, report_id)
    return {"count": count, "machine_name": report.machine_name}


@router.delete("/{report_id}", status_code=204)
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """報告を削除する（admin / maker のみ）。204 = 成功・レスポンスボディなし。"""
    if not crud.delete_report(db, report_id):
        raise HTTPException(status_code=404, detail="報告が見つかりません")


@router.get("/{report_id}/pdf")
def download_pdf(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """報告書を PDF で生成してダウンロードさせる。
    Content-Disposition: attachment でブラウザにダウンロードダイアログを出させる。
    PDF 生成には ReportLab + IPAex ゴシック（日本語対応フォント）を使う。"""
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
