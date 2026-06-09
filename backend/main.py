import os
from dotenv import load_dotenv

# .env ファイルを読み込む（ローカル開発用）。
# 本番（Railway）では環境変数が直接設定されているため .env は不要だが、
# load_dotenv は .env が存在しない場合でも何もしないので呼んでも安全。
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import UPLOAD_DIR, init_db
from routers import reports
from routers import auth as auth_router
from routers import chat as chat_router
from routers import ai_interview as ai_interview_router
from routers import check_items as check_items_router
from routers.chat import summary_router
from ws_manager import manager

# FastAPI インスタンスを作成。title と version は /docs（Swagger UI）に表示される。
app = FastAPI(title="異常報告管理API", version="3.0.0")

# CORS（クロスオリジンリソース共有）の設定。
# フロント（例: localhost:3000）とバック（localhost:8000）はオリジンが異なるため、
# ブラウザがリクエストをブロックする。このミドルウェアで「許可するオリジン」を明示する。
# ALLOWED_ORIGINS をカンマ区切りにすることで、本番URL とローカルを両方許可できる。
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,   # Cookie / Authorization ヘッダーを許可
    allow_methods=["*"],      # GET / POST / PUT / PATCH / DELETE をすべて許可
    allow_headers=["*"],      # Content-Type / Authorization など任意ヘッダーを許可
)

# サーバー起動時にテーブルを作成・マイグレーションを実行する。
# コードを変更するたびに手動でコマンドを叩かなくていいようにここに置いている。
init_db()

# 各機能のルーターを登録。ファイルを分けることでコードの見通しが良くなる。
app.include_router(auth_router.router)         # ログイン・サインアップ
app.include_router(reports.router)             # 報告の CRUD・PDF・統計
app.include_router(summary_router)             # チャット未読サマリー
app.include_router(chat_router.router)         # チャットメッセージ
app.include_router(ai_interview_router.router) # AI ヒアリング・サジェスト
app.include_router(check_items_router.router)  # 事前確認項目の管理

# /files/<filename> でアップロードされた画像・動画を直接配信する。
# StaticFiles は FastAPI が内部で使っている Starlette の機能。
# 本番では Railway の Volume（UPLOAD_DIR）を指している。
app.mount("/files", StaticFiles(directory=UPLOAD_DIR), name="files")


@app.get("/")
def health():
    """ヘルスチェック用エンドポイント。Railway がサーバー起動確認に使う。"""
    return {"status": "ok"}


@app.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket):
    """WebSocket 接続を管理する。
    新規報告が投稿されると broadcast で全接続クライアントに通知が届く。
    ブラウザが切断したら WebSocketDisconnect 例外が発生するので、
    その際に接続リストから除外している。"""
    await manager.connect(websocket)
    try:
        while True:
            # クライアントからのメッセージを待ち続ける（ping-pong 維持）。
            # 実際には受信内容を使わないが、receive_text() を呼ばないと
            # 接続が切れても例外が発生しない。
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
