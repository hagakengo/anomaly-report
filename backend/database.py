import os
from sqlalchemy import create_engine, Column, ForeignKey, Integer, String, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

# Railway Volume は UPLOAD_DIR 環境変数で上書き可能（デフォルト: backend/uploads/）
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

# DB設定
DB_PATH = os.path.join(os.path.dirname(__file__), "reports.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    email        = Column(String, unique=True, nullable=False, index=True)
    username     = Column(String, nullable=False)
    hashed_pw    = Column(String, nullable=False)
    role         = Column(String, nullable=False, default="customer")  # "admin" | "customer" | "maker"
    company_name = Column(String, nullable=True)
    created_at   = Column(String, nullable=False,
                      server_default=text("(datetime('now', 'localtime'))"))


class Report(Base):
    __tablename__ = "reports"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    machine_name  = Column(String, nullable=False)
    location      = Column(String, nullable=False)
    description   = Column(String, nullable=False)
    severity      = Column(String, nullable=False, default="medium")  # high/medium/low
    status        = Column(String, nullable=False, default="open")    # open/in_progress/resolved
    file_path     = Column(String)
    file_type     = Column(String)                                     # image / video
    company_name  = Column(String, nullable=True)
    reported_at   = Column(String, nullable=False,
                      server_default=text("datetime('now', 'localtime')"))
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=True)
    assignee_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    assignee_name = Column(String, nullable=True)


class Message(Base):
    __tablename__ = "messages"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    report_id  = Column(Integer, ForeignKey("reports.id"), nullable=False)
    sender_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    content    = Column(String, nullable=False)
    created_at = Column(String, nullable=False,
                    server_default=text("(datetime('now', 'localtime'))"))


class CheckItem(Base):
    __tablename__ = "check_items"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    content      = Column(String, nullable=False)
    machine_name = Column(String, nullable=True)   # NULL = 全機器共通
    order_index  = Column(Integer, nullable=False, default=0)
    created_at   = Column(String, nullable=False,
                      server_default=text("(datetime('now', 'localtime'))"))


class StatusLog(Base):
    __tablename__ = "status_logs"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    report_id  = Column(Integer, ForeignKey("reports.id"), nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    old_status = Column(String, nullable=False)
    new_status = Column(String, nullable=False)
    changed_at = Column(String, nullable=False,
                    server_default=text("(datetime('now', 'localtime'))"))


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    # 既存テーブルへの新カラム追加（ALTER TABLE は冪等に）
    _migrations = [
        "ALTER TABLE reports ADD COLUMN assignee_id INTEGER REFERENCES users(id)",
        "ALTER TABLE reports ADD COLUMN assignee_name TEXT",
        "ALTER TABLE reports ADD COLUMN company_name TEXT",
        "ALTER TABLE users ADD COLUMN company_name TEXT",
        "ALTER TABLE check_items ADD COLUMN machine_name TEXT",
    ]
    with engine.connect() as conn:
        for sql in _migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass