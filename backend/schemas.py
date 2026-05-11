from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


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

    model_config = {"from_attributes": True}
