import os
import smtplib
from email.mime.text import MIMEText


def send_high_severity_email(report_id: int, machine_name: str, location: str, description: str) -> None:
    host = os.environ.get("SMTP_HOST", "")
    recipient = os.environ.get("NOTIFY_EMAIL", "")
    if not host or not recipient:
        return

    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")

    body = f"""高重要度の異常報告が登録されました。

報告 #{report_id}
機器名: {machine_name}
場所:   {location}
内容:   {description[:300]}

システムにアクセスして対応してください。
"""
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = f"【緊急】異常報告 #{report_id} — {machine_name}"
    msg["From"] = user or "noreply@anomaly-system"
    msg["To"] = recipient

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            if user and password:
                server.login(user, password)
            server.send_message(msg)
    except Exception as e:
        print(f"[email] send failed: {e}")
