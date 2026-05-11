import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import UPLOAD_DIR, init_db
from routers import reports

app = FastAPI(title="異常報告管理API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# DBテーブル作成
init_db()

# ルーター登録
app.include_router(reports.router)

# アップロードファイル配信
app.mount("/files", StaticFiles(directory=UPLOAD_DIR), name="files")


@app.get("/")
def health():
    return {"status": "ok"}
