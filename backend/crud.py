from typing import Optional
from fastapi import HTTPException
from sqlalchemy import asc, desc
from sqlalchemy.orm import Session
from database import Message, Report, StatusLog, User
from schemas import ReportCreate, ReportUpdate, MessageCreate


def get_reports(
    db: Session,
    machine_name: Optional[str] = None,
    location: Optional[str] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "reported_at",
    sort_order: str = "desc",
    user_id: Optional[int] = None,
    company_name: Optional[str] = None,
) -> list[Report]:
    q = db.query(Report)
    if machine_name:
        q = q.filter(Report.machine_name.contains(machine_name))
    if location:
        q = q.filter(Report.location.contains(location))
    if status:
        q = q.filter(Report.status == status)
    if severity:
        q = q.filter(Report.severity == severity)
    if date_from:
        q = q.filter(Report.reported_at >= date_from)
    if date_to:
        q = q.filter(Report.reported_at <= date_to + " 23:59:59")
    if user_id is not None:
        q = q.filter(Report.user_id == user_id)
    if company_name:
        q = q.filter(Report.company_name.contains(company_name))

    col = {
        "reported_at": Report.reported_at,
        "severity": Report.severity,
        "status": Report.status,
    }.get(sort_by, Report.reported_at)
    q = q.order_by(asc(col) if sort_order == "asc" else desc(col))
    return q.all()


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
    company_name: Optional[str] = None,
) -> Report:
    report = Report(
        machine_name=data.machine_name,
        location=data.location,
        description=data.description,
        severity=data.severity,
        file_path=file_path,
        file_type=file_type,
        user_id=user_id,
        company_name=company_name,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def update_report_status(
    db: Session,
    report_id: int,
    data: ReportUpdate,
    user_id: Optional[int] = None,
) -> Optional[Report]:
    from datetime import datetime
    report = get_report(db, report_id)
    if not report:
        return None
    old_status = report.status
    report.status = data.status
    if old_status != data.status:
        db.add(StatusLog(
            report_id=report_id,
            user_id=user_id,
            old_status=old_status,
            new_status=data.status,
            changed_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ))
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


def get_recurrence_count(db: Session, machine_name: str, exclude_id: int, days: int = 30) -> int:
    from datetime import datetime, timedelta
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    return (
        db.query(Report)
        .filter(Report.machine_name == machine_name, Report.id != exclude_id, Report.reported_at >= cutoff)
        .count()
    )


def assign_report(db: Session, report_id: int, assignee_id: Optional[int], assignee_name: Optional[str]) -> Optional[Report]:
    report = get_report(db, report_id)
    if not report:
        return None
    report.assignee_id = assignee_id
    report.assignee_name = assignee_name
    db.commit()
    db.refresh(report)
    return report


def get_stats(db: Session, user_id: Optional[int] = None) -> dict:
    from collections import defaultdict
    q = db.query(Report)
    if user_id is not None:
        q = q.filter(Report.user_id == user_id)
    reports = q.all()

    monthly: dict[str, int] = defaultdict(int)
    by_severity = {"high": 0, "medium": 0, "low": 0}
    by_status = {"open": 0, "in_progress": 0, "resolved": 0}
    machine_counts: dict[str, int] = defaultdict(int)

    for r in reports:
        month = (r.reported_at or "")[:7]
        if month:
            monthly[month] += 1
        by_severity[r.severity] = by_severity.get(r.severity, 0) + 1
        by_status[r.status] = by_status.get(r.status, 0) + 1
        machine_counts[r.machine_name] += 1

    # 再発機器（同一機器で2件以上）
    from datetime import datetime, timedelta
    cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    recent_machine: dict[str, int] = defaultdict(int)
    for r in reports:
        if (r.reported_at or "") >= cutoff:
            recent_machine[r.machine_name] += 1
    recurring = sorted(
        [{"machine_name": k, "count": v} for k, v in recent_machine.items() if v >= 2],
        key=lambda x: x["count"],
        reverse=True,
    )

    return {
        "monthly": [{"month": k, "count": v} for k, v in sorted(monthly.items())][-12:],
        "by_severity": by_severity,
        "by_status": by_status,
        "top_machines": sorted(
            [{"machine_name": k, "count": v} for k, v in machine_counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:10],
        "recurring_machines": recurring,
    }


def get_status_logs(db: Session, report_id: int) -> list[dict]:
    logs = (
        db.query(StatusLog)
        .filter(StatusLog.report_id == report_id)
        .order_by(StatusLog.changed_at.asc())
        .all()
    )
    result = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first() if log.user_id else None
        result.append({
            "id": log.id,
            "report_id": log.report_id,
            "user_id": log.user_id,
            "changed_by": user.username if user else "システム",
            "old_status": log.old_status,
            "new_status": log.new_status,
            "changed_at": log.changed_at,
        })
    return result


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
    if role in ("admin", "maker"):
        report_ids = [r[0] for r in db.query(Report.id).all()]
    else:
        report_ids = [
            r[0] for r in db.query(Report.id).filter(Report.user_id == user_id).all()
        ]

    result = []
    for rid in report_ids:
        latest = (
            db.query(Message)
            .filter(Message.report_id == rid, Message.sender_id != user_id)
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
