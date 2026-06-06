from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


# ── 既存レポートスキーマ ────────────────────────────────────────

class ReportCreate(BaseModel):
    machine_name: str
    location: str
    description: str
    severity: str = "medium"   # high / medium / low


class ReportUpdate(BaseModel):
    status: str   # open / in_progress / resolved


class ReportOut(BaseModel):
    id: int
    machine_name: str
    location: str
    description: str
    severity: str
    status: str
    file_path: Optional[str] = None
    file_type: Optional[str] = None
    reported_at: str
    user_id: Optional[int] = None
    assignee_id: Optional[int] = None
    assignee_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ── 認証スキーマ ────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str
    username: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    user_id: int


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    role: str

    model_config = {"from_attributes": True}


# ── チャットスキーマ ────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str


class MessageOut(BaseModel):
    id: int
    report_id: int
    sender_id: int
    sender_name: str
    content: str
    created_at: str

    model_config = {"from_attributes": True}


class MessageSummary(BaseModel):
    report_id: int
    latest_message_id: int
    preview: str
    sender_name: str
    latest_at: str


class AssignRequest(BaseModel):
    assignee_id: Optional[int] = None


class StatsOut(BaseModel):
    monthly: list[dict]
    by_severity: dict
    by_status: dict
    top_machines: list[dict]
    recurring_machines: list[dict]


class StatusLogOut(BaseModel):
    id: int
    report_id: int
    user_id: Optional[int] = None
    changed_by: str
    old_status: str
    new_status: str
    changed_at: str
