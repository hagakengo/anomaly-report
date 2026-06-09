"""AI ヒアリング関連のルーター。
現在は選択ウィザード（フロント側）に移行したため、
このモジュールが担うのは2つだけ：
  1. /suggestions: 過去の報告から機器名・場所のサジェストを返す
  2. POST /ai-interview: Groq API への中継（将来の拡張・デモ用に残している）
"""

import json
import os
import re
from typing import Optional

from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import Report, User, get_db

router = APIRouter(prefix="/ai-interview", tags=["ai-interview"])

# LLM に渡すシステムプロンプト。
# 「情報を1つずつ聞く」「全情報が揃ったら JSON だけを返す」というルールを明示している。
# 出力フォーマットを固定することで、フロント側が正規表現で JSON を抽出できる。
SYSTEM_PROMPT = """あなたは工場の異常報告システムのAIアシスタントです。
お客様から異常報告に必要な情報を日本語で丁寧にヒアリングしてください。

収集する情報（順番通りに1つずつ聞いてください）：
1. 機器名（例：ポンプA、コンベアB-3）
2. 発生場所（例：第1工場 B棟 2F）
3. 異常の内容・症状（できるだけ詳しく）
4. 重要度の自動判断（症状から判断し、確認する）

ルール：
- 一度に1つの質問のみ
- 丁寧・簡潔に
- すべての情報が揃ったら、以下のJSONのみを返してください（前後に一切のテキストを含めないこと）：
{"type":"complete","machine_name":"機器名","location":"場所","description":"詳細な症状","severity":"high|medium|low"}

severity の基準：
- high: 生産停止・安全リスク・即時対応が必要
- medium: 早期対応が必要だが継続稼働可能
- low: 経過観察で問題ない軽微な異常"""


class InterviewMessage(BaseModel):
    role: str    # "user" または "assistant"
    content: str


class InterviewRequest(BaseModel):
    messages: list[InterviewMessage]
    check_context: Optional[str] = None  # 事前確認の結果をプロンプトに追加する場合に使う


class InterviewResponse(BaseModel):
    content: str
    complete: bool = False          # True のとき report_data に報告データが入っている
    report_data: Optional[dict] = None


class SuggestionsResponse(BaseModel):
    machine_names: list[str]
    locations: list[str]


@router.get("/suggestions", response_model=SuggestionsResponse)
def get_suggestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """過去の報告から使用頻度の高い機器名・場所を最大8件返す。
    選択ウィザードの「場所」フェーズでチップ表示するために使う。
    Counter.most_common(8) で出現頻度順に上位8件を取得している。

    Groq API を使わず DB だけで完結するため、
    API キーなしでもサジェストが動く。"""
    reports = db.query(Report.machine_name, Report.location).all()
    machine_counts = Counter(r.machine_name for r in reports if r.machine_name)
    location_counts = Counter(r.location for r in reports if r.location)
    return SuggestionsResponse(
        machine_names=[name for name, _ in machine_counts.most_common(8)],
        locations=[loc for loc, _ in location_counts.most_common(8)],
    )


@router.post("", response_model=InterviewResponse)
async def interview(
    req: InterviewRequest,
    current_user: User = Depends(get_current_user),
):
    """Groq API（Llama 3.3 70B）に会話を送り、AI の返答を返す。

    Groq を選んだ理由：
    - 無料枠が大きく（1日数百万トークン）、ポートフォリオのデモに向いている
    - Llama 3.3 70B は日本語の品質も高い
    - OpenAI互換 API のため、将来 GPT に乗り換えるのも容易

    check_context が渡された場合、事前確認の結果を
    システムプロンプトに追記してから LLM に送る。

    LLM が {"type":"complete",...} という JSON を返してきたら
    complete=True にして報告データをパースして返す。
    正規表現でテキスト中から JSON を抽出しているのは、
    LLM が「これが JSON です:」などの前置きを付けることがあるため。"""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI機能が設定されていません（GROQ_API_KEY が未設定です）",
        )

    client = Groq(api_key=api_key)
    system_prompt = SYSTEM_PROMPT
    if req.check_context:
        system_prompt += f"\n\n【事前確認結果】\n{req.check_context}\n上記の確認結果を踏まえてヒアリングしてください。異常ありの項目があれば症状の詳細を重点的に確認してください。"

    # メッセージ形式を Groq SDK の期待する形式に変換する
    messages = [{"role": "system", "content": system_prompt}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=1024,
        messages=messages,
    )

    text = (response.choices[0].message.content or "").strip()

    # LLM の返答に {"type":"complete",...} が含まれているか正規表現で探す
    try:
        json_match = re.search(r'\{[^{}]*"type"\s*:\s*"complete"[^{}]*\}', text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            if data.get("type") == "complete":
                return InterviewResponse(
                    content="ありがとうございました。報告書を作成します...",
                    complete=True,
                    report_data={
                        "machine_name": data["machine_name"],
                        "location": data["location"],
                        "description": data["description"],
                        "severity": data.get("severity", "medium"),
                    },
                )
    except (json.JSONDecodeError, KeyError):
        pass  # JSON のパースに失敗した場合は通常の会話として処理を続ける

    return InterviewResponse(content=text)
