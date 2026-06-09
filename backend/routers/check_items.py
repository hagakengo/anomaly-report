from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, require_staff
from database import CheckItem, Report, User, get_db

# prefix="/check-items" によりこのルーター内の全エンドポイントは
# /check-items/... というパスになる。
router = APIRouter(prefix="/check-items", tags=["check-items"])


class CheckItemCreate(BaseModel):
    """確認項目の作成・更新に使う入力スキーマ。
    machine_name=None（省略可）が「共通項目」を意味する。"""
    content: str
    machine_name: Optional[str] = None
    order_index: int = 0


class CheckItemOut(BaseModel):
    """APIレスポンスとして返す確認項目の形式。
    model_config で ORM オブジェクト（SQLAlchemy モデル）を
    直接 Pydantic モデルに変換できるようにしている。"""
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
    machine_name 指定あり → その機器専用の項目 + 共通項目（machine_name=NULL）を返す
    machine_name 指定なし → 全項目を返す（設定画面でグループを一覧するために使う）

    このエンドポイントを1つで2つの用途に対応させた理由：
    - 報告フロー（選択ウィザード）では「選んだ機器 + 共通」を一度に取りたい
    - 設定画面では全項目を取ってフロントでグループ分けしたい
    パラメータを任意にするだけで両対応できるため、エンドポイントを分けなかった。
    """
    q = db.query(CheckItem)
    if machine_name:
        q = q.filter(
            # OR 条件: 機器名が一致 or NULL（共通項目）
            # noqa: E711 は「== None を is None と書け」という PEP8 警告を抑制するコメント。
            # SQLAlchemy では is None ではなく == None を使う必要があるため。
            (CheckItem.machine_name == machine_name) | (CheckItem.machine_name == None)  # noqa: E711
        )
    return q.order_by(CheckItem.machine_name, CheckItem.order_index, CheckItem.id).all()


@router.get("/machines", response_model=list[str])
def list_machines(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """設定画面の左サイドバーで使う機器名一覧を返す。
    確認項目に登録された機器名と、過去の報告に出てくる機器名を合わせて返す。
    こうすることで「報告実績はあるが確認項目がまだない機器」も設定画面に表示される。
    集合演算（|）で重複を除去している。"""
    check_machines = {
        r[0] for r in db.query(CheckItem.machine_name).filter(CheckItem.machine_name != None).all()  # noqa: E711
    }
    report_machines = {r[0] for r in db.query(Report.machine_name).all()}
    return sorted(check_machines | report_machines)


@router.post("", response_model=CheckItemOut, status_code=201)
def create_check_item(
    data: CheckItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),  # admin / maker だけが作成可能
):
    """確認項目を新規作成する。
    machine_name が空文字列の場合も None（共通扱い）にするため `or None` を使っている。
    フロントが空文字を送ってきても正しく NULL で保存される。"""
    item = CheckItem(
        content=data.content,
        machine_name=data.machine_name or None,
        order_index=data.order_index,
    )
    db.add(item)
    db.commit()
    db.refresh(item)  # DB が生成した id などを Python オブジェクトに反映させる
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


# ⚠ 重要: /dedup は /{item_id} より先に定義する必要がある。
# FastAPI は上から順にルートをマッチングするため、
# /{item_id} を先に定義すると DELETE /check-items/dedup が
# item_id="dedup"（文字列）として処理されてしまい、int 変換エラーになる。
@router.delete("/dedup", status_code=200)
def dedup_check_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """content と machine_name の組み合わせが同じ重複項目を削除する。
    id が小さい方（先に登録された方）を残す。
    実装: 全項目を id 昇順で取得し、seen セットで「初出のキー」を記録。
    2回目以降に同じキーが出たら削除対象にする（O(n) で済む）。"""
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
    """確認項目を1件削除する。204 は「成功したがレスポンスボディなし」を意味する。"""
    item = db.query(CheckItem).filter(CheckItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="項目が見つかりません")
    db.delete(item)
    db.commit()
