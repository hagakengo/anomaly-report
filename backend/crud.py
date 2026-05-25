from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from database import Message, Report, User
from schemas import ReportCreate, ReportUpdate, MessageCreate


def get_reports(
    db: Session,
    machine_name: Optional[str] = None,
    location: Optional[str] = None,
    status: Optional[str] = None,
    user_id: Optional[int] = None,
) -> list[Report]:
    q = db.query(Report)
    if machine_name:
        q = q.filter(Report.machine_name.contains(machine_name))
    if location:
        q = q.filter(Report.location.contains(location))
    if status:
        q = q.filter(Report.status == status)
    if user_id is not None:
        q = q.filter(Report.user_id == user_id)
    return q.order_by(Report.reported_at.desc()).all()


def get_report(db: Session, report_id: int) -> Optional[Report]:
    return db.query(Report).filter(Report.id == report_id).first()


def assert_report_owner(report: Report, user_id: int, role: str) -> None:
    if role == "customer" and report.user_id != user_id:
        raise HTTPException(status_code=403, detail="アクセス権限がありません")


def create_report(
    db: Session,
    data: ReportCreate,
    file_path: Optional[str] = None,
    file_type: Optional[str] = None,
    user_id: Optional[int] = None,
) -> Report:
    report = Report(
        machine_name=data.machine_name,
        location=data.location,
        description=data.description,
        severity=data.severity,
        file_path=file_path,
        file_type=file_type,
        user_id=user_id,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def update_report_status(db: Session, report_id: int, data: ReportUpdate) -> Optional[Report]:
    report = get_report(db, report_id)
    if not report:
        return None
    report.status = data.status
    db.commit()
    db.refresh(report)
    return report


def update_report(
    db: Session,
    report_id: int,
    data: ReportCreate,
    file_path: Optional[str] = None,
    file_type: Optional[str] = None,
) -> Optional[Report]:
    report = get_report(db, report_id)
    if not report:
        return None
    report.machine_name = data.machine_name
    report.location = data.location
    report.description = data.description
    report.severity = data.severity
    if file_path is not None:
        report.file_path = file_path
        report.file_type = file_type
    db.commit()
    db.refresh(report)
    return report


def delete_report(db: Session, report_id: int) -> bool:
    report = get_report(db, report_id)
    if not report:
        return False
    db.delete(report)
    db.commit()
    return True


# ── チャット ────────────────────────────────────────────────────

def get_messages(db: Session, report_id: int) -> list[Message]:
    return (
        db.query(Message)
        .filter(Message.report_id == report_id)
        .order_by(Message.created_at.asc())
        .all()
    )


def get_latest_messages_per_report(
    db: Session, user_id: int, role: str
) -> list[dict]:
    """各レポートの最新メッセージを1件ずつ返す (未読チェック用)。"""
    if role == "admin":
        report_ids = [r[0] for r in db.query(Report.id).all()]
    else:
        report_ids = [
            r[0] for r in db.query(Report.id).filter(Report.user_id == user_id).all()
        ]

    result = []
    for rid in report_ids:
        latest = (
            db.query(Message)
            .filter(Message.report_id == rid)
            .order_by(Message.id.desc())
            .first()
        )
        if latest:
            sender = db.query(User).filter(User.id == latest.sender_id).first()
            result.append({
                "report_id": rid,
                "latest_message_id": latest.id,
                "preview": latest.content[:50],
                "sender_name": sender.username if sender else "不明",
                "latest_at": latest.created_at,
            })
    return result


def create_message(
    db: Session,
    report_id: int,
    sender_id: int,
    content: str,
) -> Message:
    msg = Message(report_id=report_id, sender_id=sender_id, content=content)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg
