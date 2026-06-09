import os
from sqlalchemy import create_engine, Column, ForeignKey, Integer, String, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

# アップロード先ディレクトリ。
# 環境変数 UPLOAD_DIR が設定されていればそちらを使う（Railway の Volume など本番環境向け）。
# 未設定ならこのファイルと同じ場所に "uploads/" フォルダを作る。
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)  # フォルダがなければ自動作成

# SQLite のファイルパス。ローカル開発ではこのファイルが DB そのもの。
# 本番（Railway）では Volume がマウントされるのでデータが消えない。
DB_PATH = os.path.join(os.path.dirname(__file__), "reports.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# SQLAlchemy のエンジン（DB接続の本体）。
# check_same_thread=False は SQLite 固有の設定。
# SQLite はデフォルトで「1スレッドからしか使えない」制限があるが、
# FastAPI は非同期で複数スレッドからアクセスするため無効化している。
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# SessionLocal はDB操作の「作業セッション」を作るファクトリ。
# autocommit=False → 明示的に commit() を呼ぶまで変更が確定しない（安全）
# autoflush=False  → commit 前に自動で SQL を発行しない
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    # すべてのモデルクラスはここを継承する。
    # Base.metadata.create_all() でまとめてテーブルを作れるようになる。
    pass


class User(Base):
    __tablename__ = "users"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    email        = Column(String, unique=True, nullable=False, index=True)  # index=True で検索を高速化
    username     = Column(String, nullable=False)
    hashed_pw    = Column(String, nullable=False)  # パスワードは平文で保存しない（bcryptでハッシュ化）
    # role は3種類だけだが、将来の拡張性を考えて文字列型にしている
    role         = Column(String, nullable=False, default="customer")  # "admin" | "customer" | "maker"
    company_name = Column(String, nullable=True)  # 任意項目。メーカーが顧客会社でフィルタするために使う
    created_at   = Column(String, nullable=False,
                      server_default=text("(datetime('now', 'localtime'))"))
    # server_default は Python 側でなく DB 側で値を生成する。
    # アプリが日時を設定し忘れてもDBが補完してくれるため安全。


class Report(Base):
    __tablename__ = "reports"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    machine_name  = Column(String, nullable=False)
    location      = Column(String, nullable=False)
    description   = Column(String, nullable=False)
    severity      = Column(String, nullable=False, default="medium")  # high / medium / low
    status        = Column(String, nullable=False, default="open")    # open / in_progress / resolved
    file_path     = Column(String)        # 画像・動画のパス。添付なしなら NULL
    file_type     = Column(String)        # "image" か "video"
    company_name  = Column(String, nullable=True)  # 報告したユーザーの会社名を記録
    reported_at   = Column(String, nullable=False,
                      server_default=text("datetime('now', 'localtime')"))
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=True)
    # ForeignKey で users テーブルの id と紐付け。削除されたユーザーの報告は残るよう nullable=True
    assignee_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    assignee_name = Column(String, nullable=True)  # 毎回 JOIN しなくて済むよう名前も直接保存


class Message(Base):
    __tablename__ = "messages"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    report_id  = Column(Integer, ForeignKey("reports.id"), nullable=False)
    sender_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    content    = Column(String, nullable=False)
    created_at = Column(String, nullable=False,
                    server_default=text("(datetime('now', 'localtime'))"))


class CheckItem(Base):
    """事前確認チェック項目。メーカーが定義し、オペレーターが報告前に確認する。"""
    __tablename__ = "check_items"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    content      = Column(String, nullable=False)
    # machine_name が NULL → 全機器に共通する項目
    # machine_name に値あり → その機器専用の項目
    # この設計により「共通項目を各機器にコピーする手間」をなくしている
    machine_name = Column(String, nullable=True)
    order_index  = Column(Integer, nullable=False, default=0)  # 表示順の制御
    created_at   = Column(String, nullable=False,
                      server_default=text("(datetime('now', 'localtime'))"))


class StatusLog(Base):
    """ステータス変更の履歴。誰がいつ何から何に変えたかを追跡できる。"""
    __tablename__ = "status_logs"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    report_id  = Column(Integer, ForeignKey("reports.id"), nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    old_status = Column(String, nullable=False)
    new_status = Column(String, nullable=False)
    changed_at = Column(String, nullable=False,
                    server_default=text("(datetime('now', 'localtime'))"))


def get_db():
    """FastAPI の Depends() に渡すジェネレータ関数。
    リクエストの処理が終わると finally ブロックで必ず DB セッションを閉じる。
    これをしないと接続が開きっぱなしになりリソースを消費し続ける。"""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """サーバー起動時に1回だけ呼ばれる。テーブル作成とカラム追加を行う。"""
    # モデルクラスに対応するテーブルをすべて作成（既存なら何もしない）
    Base.metadata.create_all(bind=engine)

    # 後から追加したカラムを既存DBに反映するマイグレーション。
    # Alembic などの本格的なツールを使うのが本来の正解だが、
    # このアプリはシンプルさを優先して try/except で冪等に実装している。
    # 「冪等」= 何回実行しても同じ結果になること。
    # カラムが既に存在する場合は ALTER TABLE がエラーになるが、except で無視している。
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
                pass  # 既にカラムがある場合のエラーは無視
