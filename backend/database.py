import os
from sqlalchemy import create_engine, Column, Integer, String, text
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


class Report(Base):
    __tablename__ = "reports"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    machine_name = Column(String, nullable=False)   # 機器名
    location     = Column(String, nullable=False)   # 発生場所
    description  = Column(String, nullable=False)   # 異常内容
    severity     = Column(String, nullable=False, default="medium")  # high/medium/low
    status       = Column(String, nullable=False, default="open")    # open/in_progress/resolved
    file_path    = Column(String)                   # アップロードファイルパス
    file_type    = Column(String)                   # image / video
    reported_at  = Column(String, nullable=False,
                    server_default=text("datetime('now', 'localtime')"))


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)