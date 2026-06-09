"""CRUD 操作をルーターから切り離したモジュール。
ルーター（routers/）は HTTP の入出力を担当し、
このファイルは DB の読み書きだけを担当する、という責務分離のための構成。
テストを書く際にもルーターを経由せず直接関数を呼べるメリットがある。"""

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
    """フィルタ・ソート付きで報告一覧を取得する。
    None が渡されたフィルタは無視されるため、
    フロントが指定した条件だけが WHERE 句に追加される。
    contains() は SQL の LIKE '%値%' に変換され、部分一致検索になる。"""
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
        # date_to が "2024-01-31" なら "2024-01-31 23:59:59" まで含める。
        # 時刻なしの日付文字列を <= で比較すると "2024-01-31 00:00:00" 以前しかヒットしない。
        q = q.filter(Report.reported_at <= date_to + " 23:59:59")
    if user_id is not None:
        q = q.filter(Report.user_id == user_id)
    if company_name:
        q = q.filter(Report.company_name.contains(company_name))

    # ソート列を文字列から ORM カラムに変換する辞書。
    # 不正な sort_by 値が来ても reported_at にフォールバックして安全。
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
    """customer ロールの場合、自分が作成した報告しか見られないことを強制する。
    admin / maker はすべての報告にアクセスできるため role チェックが先に入る。"""
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
    """報告を新規作成して DB に保存する。
    company_name はユーザーの所属会社名を記録しておくことで、
    後からメーカーが「どの会社からの報告か」でフィルタできるようにしている。"""
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
    """ステータスを変更し、変更履歴（StatusLog）を記録する。
    同じステータスに更新しても履歴を積まないよう old_status != new_status を確認している。"""
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
    """報告内容（機器名・場所・説明・重要度）を更新する。
    file_path が None の場合は既存のファイルをそのまま維持する。
    新しいファイルが添付された場合だけ上書きする設計。"""
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
    """直近 days 日以内に同じ機器名の報告が何件あるかを返す（今回の報告自身は除く）。
    メーカーが「この機器は繰り返し壊れている」と把握するための再発アラートに使う。"""
    from datetime import datetime, timedelta
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    return (
        db.query(Report)
        .filter(Report.machine_name == machine_name, Report.id != exclude_id, Report.reported_at >= cutoff)
        .count()
    )


def assign_report(db: Session, report_id: int, assignee_id: Optional[int], assignee_name: Optional[str]) -> Optional[Report]:
    """担当者（assignee）をアサインする。assignee_id=None でアサイン解除。
    assignee_name を直接保存しているのは、ユーザー一覧を毎回 JOIN しなくて済むようにするため（非正規化）。"""
    report = get_report(db, report_id)
    if not report:
        return None
    report.assignee_id = assignee_id
    report.assignee_name = assignee_name
    db.commit()
    db.refresh(report)
    return report


def get_stats(db: Session, user_id: Optional[int] = None) -> dict:
    """ダッシュボード用の統計データを返す。
    customer の場合は user_id でフィルタして自社分だけを集計する。
    admin / maker は user_id=None で全件が対象になる。

    monthly は直近12ヶ月分だけ返す（[-12:]）。
    recurring_machines は直近30日で2件以上の機器を「再発機器」として返す。"""
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
        month = (r.reported_at or "")[:7]  # "YYYY-MM-DD HH:MM:SS" から "YYYY-MM" を取り出す
        if month:
            monthly[month] += 1
        by_severity[r.severity] = by_severity.get(r.severity, 0) + 1
        by_status[r.status] = by_status.get(r.status, 0) + 1
        machine_counts[r.machine_name] += 1

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
    """ステータス変更履歴を返す。
    ユーザー名を表示するために User テーブルを都度クエリしているが、
    件数が少ないため JOIN より分かりやすいコードを優先している。"""
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
    """ダッシュボードの「新着メッセージ」バッジ用。
    各報告の最新メッセージを取得する（自分が送ったメッセージは除外）。
    admin / maker は全報告を対象、customer は自分の報告のみ対象にする。"""
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
                "preview": latest.content[:50],  # 50文字までプレビュー表示
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
