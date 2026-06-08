from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, require_staff
from database import CheckItem, Report, User, get_db

router = APIRouter(prefix="/check-items", tags=["check-items"])


class CheckItemCreate(BaseModel):
    content: str
    machine_name: Optional[str] = None
    order_index: int = 0


class CheckItemOut(BaseModel):
    id: int
    content: str
    machine_name: Optional[str] = None
    order_index: int

    model_config = {"from_attributes": True}


@router.get("", response_model=list[CheckItemOut])
def list_check_items(
    machine_name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    machine_name 指定あり → その機器の項目 + 共通項目（machine_name=NULL）を返す
    machine_name 指定なし → 全項目を返す（設定画面用）
    """
    q = db.query(CheckItem)
    if machine_name:
        q = q.filter(
            (CheckItem.machine_name == machine_name) | (CheckItem.machine_name == None)  # noqa: E711
        )
    return q.order_by(CheckItem.machine_name, CheckItem.order_index, CheckItem.id).all()


@router.get("/machines", response_model=list[str])
def list_machines(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """確認項目が登録されている機器名一覧 + 過去の報告に出てくる機器名を返す"""
    check_machines = {
        r[0] for r in db.query(CheckItem.machine_name).filter(CheckItem.machine_name != None).all()  # noqa: E711
    }
    report_machines = {r[0] for r in db.query(Report.machine_name).all()}
    return sorted(check_machines | report_machines)


@router.post("", response_model=CheckItemOut, status_code=201)
def create_check_item(
    data: CheckItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    item = CheckItem(
        content=data.content,
        machine_name=data.machine_name or None,
        order_index=data.order_index,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=CheckItemOut)
def update_check_item(
    item_id: int,
    data: CheckItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    item = db.query(CheckItem).filter(CheckItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="項目が見つかりません")
    item.content = data.content
    item.machine_name = data.machine_name or None
    item.order_index = data.order_index
    db.commit()
    db.refresh(item)
    return item


@router.delete("/dedup", status_code=200)
def dedup_check_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """content + machine_name が同じ重複項目を削除し、最小 id のものだけ残す"""
    all_items = db.query(CheckItem).order_by(CheckItem.id).all()
    seen: set[tuple] = set()
    deleted = 0
    for item in all_items:
        key = (item.content.strip(), item.machine_name)
        if key in seen:
            db.delete(item)
            deleted += 1
        else:
            seen.add(key)
    db.commit()
    return {"deleted": deleted}


@router.delete("/{item_id}", status_code=204)
def delete_check_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    item = db.query(CheckItem).filter(CheckItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="項目が見つかりません")
    db.delete(item)
    db.commit()
