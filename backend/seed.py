"""管理者アカウントを1件だけ作成するスクリプト。初回のみ実行する。
使い方: ADMIN_EMAIL=xxx ADMIN_PASSWORD=yyy python seed.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from database import SessionLocal, User, init_db
from auth import hash_password

init_db()

admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
admin_pw    = os.environ.get("ADMIN_PASSWORD", "changeme123")

db = SessionLocal()
try:
    existing = db.query(User).filter(User.email == admin_email).first()
    if existing:
        print(f"管理者アカウントは既に存在します: {admin_email}")
    else:
        admin = User(
            email=admin_email,
            username="管理者",
            hashed_pw=hash_password(admin_pw),
            role="admin",
        )
        db.add(admin)
        db.commit()
        print(f"管理者アカウントを作成しました: {admin_email}")
finally:
    db.close()
