import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import UPLOAD_DIR, init_db
from routers import reports
from routers import auth as auth_router
from routers import chat as chat_router
from routers.chat import summary_router

app = FastAPI(title="異常報告管理API", version="2.0.0")

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

app.include_router(auth_router.router)
app.include_router(reports.router)
app.include_router(summary_router)
app.include_router(chat_router.router)

app.mount("/files", StaticFiles(directory=UPLOAD_DIR), name="files")


@app.get("/")
def health():
    return {"status": "ok"}
