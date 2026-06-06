import json
import os
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel

from auth import get_current_user
from database import User

router = APIRouter(prefix="/ai-interview", tags=["ai-interview"])

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
    role: str
    content: str


class InterviewRequest(BaseModel):
    messages: list[InterviewMessage]


class InterviewResponse(BaseModel):
    content: str
    complete: bool = False
    report_data: Optional[dict] = None


@router.post("", response_model=InterviewResponse)
async def interview(
    req: InterviewRequest,
    current_user: User = Depends(get_current_user),
):
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI機能が設定されていません（GROQ_API_KEY が未設定です）",
        )

    client = Groq(api_key=api_key)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=1024,
        messages=messages,
    )

    text = (response.choices[0].message.content or "").strip()

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
        pass

    return InterviewResponse(content=text)
