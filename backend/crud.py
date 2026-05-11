from typing import Optional
from sqlalchemy.orm import Session
from database import Report
from schemas import ReportCreate, ReportUpdate


def get_reports(
    db: Session,
    machine_name: Optional[str] = None,
    location: Optional[str] = None,
    status: Optional[str] = None,
) -> list[Report]:
    q = db.query(Report)
    if machine_name:
        q = q.filter(Report.machine_name.contains(machine_name))
    if location:
        q = q.filter(Report.location.contains(location))
    if status:
        q = q.filter(Report.status == status)
    return q.order_by(Report.reported_at.desc()).all()


def get_report(db: Session, report_id: int) -> Optional[Report]:
    return db.query(Report).filter(Report.id == report_id).first()


def create_report(
    db: Session,
    data: ReportCreate,
    file_path: Optional[str] = None,
    file_type: Optional[str] = None,
) -> Report:
    report = Report(
        machine_name=data.machine_name,
        location=data.location,
        description=data.description,
        severity=data.severity,
        file_path=file_path,
        file_type=file_type,
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
