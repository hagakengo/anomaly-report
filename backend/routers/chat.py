from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
from auth import get_current_user
from database import User, get_db
from schemas import MessageCreate, MessageOut, MessageSummary

router = APIRouter(prefix="/reports/{report_id}/messages", tags=["chat"])
summary_router = APIRouter(prefix="/messages", tags=["chat"])


@summary_router.get("/unread-summary", response_model=list[MessageSummary])
def unread_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """各レポートの最新メッセージ一覧 (未読バッジ・通知用)。"""
    rows = crud.get_latest_messages_per_report(db, current_user.id, current_user.role)
    return [MessageSummary(**r) for r in rows]


@router.get("", response_model=list[MessageOut])
def list_messages(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    crud.assert_report_owner(report, current_user.id, current_user.role)

    messages = crud.get_messages(db, report_id)
    result = []
    for m in messages:
        sender = db.query(User).filter(User.id == m.sender_id).first()
        result.append(MessageOut(
            id=m.id,
            report_id=m.report_id,
            sender_id=m.sender_id,
            sender_name=sender.username if sender else "不明",
            content=m.content,
            created_at=m.created_at,
        ))
    return result


@router.post("", response_model=MessageOut, status_code=201)
def send_message(
    report_id: int,
    data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = crud.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="報告が見つかりません")
    crud.assert_report_owner(report, current_user.id, current_user.role)

    msg = crud.create_message(db, report_id, current_user.id, data.content)
    return MessageOut(
        id=msg.id,
        report_id=msg.report_id,
        sender_id=msg.sender_id,
        sender_name=current_user.username,
        content=msg.content,
        created_at=msg.created_at,
    )
