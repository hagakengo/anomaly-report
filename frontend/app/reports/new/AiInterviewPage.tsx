"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import {
  sendInterviewMessage,
  createReport,
  InterviewMessage,
} from "../../lib/api";

const GREETING =
  "こんにちは！異常報告のAIヒアリングを開始します。\nまず、異常が発生した機器名を教えてください。\n（例：ポンプA、コンベアB-3）";

const SEVERITY_LABEL: Record<string, string> = {
  high: "高（即時対応）",
  medium: "中（早期対応）",
  low: "低（経過観察）",
};

export default function AiInterviewPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<InterviewMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdReport, setCreatedReport] = useState<{
    id: number;
    machine_name: string;
    severity: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || thinking || creating) return;

    const userMsg: InterviewMessage = { role: "user", content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setThinking(true);
    setError(null);

    try {
      const res = await sendInterviewMessage(updated);
      const aiMsg: InterviewMessage = { role: "assistant", content: res.content };
      setMessages((prev) => [...prev, aiMsg]);

      if (res.complete && res.report_data) {
        setCreating(true);
        const fd = new FormData();
        fd.append("machine_name", res.report_data.machine_name);
        fd.append("location", res.report_data.location);
        fd.append("description", res.report_data.description);
        fd.append("severity", res.report_data.severity);
        const report = await createReport(fd);
        setCreatedReport({
          id: report.id,
          machine_name: report.machine_name,
          severity: report.severity,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        logout();
        router.push("/login");
      } else {
        setError(err instanceof Error ? err.message : "エラーが発生しました");
      }
    } finally {
      setThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
  };

  // 報告書作成完了後の画面
  if (createdReport) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center space-y-4">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-bold text-gray-900">報告書を作成しました</h2>
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-left space-y-1">
            <p className="text-gray-600">
              <span className="font-medium text-gray-800">報告 #{createdReport.id}</span>
              {" "}— {createdReport.machine_name}
            </p>
            <p className="text-gray-500">
              重要度：{SEVERITY_LABEL[createdReport.severity] ?? createdReport.severity}
            </p>
          </div>
          <p className="text-sm text-gray-500">管理者へリアルタイム通知を送信しました。</p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/reports/${createdReport.id}/chat`)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              チャットで追記する
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              一覧に戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 text-sm border border-gray-200 rounded px-3 py-1 transition-colors"
          >
            ← 戻る
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900">
              AIヒアリング — 新規異常報告
            </h1>
            <p className="text-xs text-gray-500">
              AIが質問形式で詳細を収集し、自動で報告書を作成します
            </p>
          </div>
          <div className="ml-auto">
            <a
              href="/reports/new/manual"
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              手動入力に切り替え
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 flex flex-col gap-4">
        {creating && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-3 text-sm text-center animate-pulse">
            報告書を作成中... 管理者に通知します
          </div>
        )}

        {/* メッセージスレッド */}
        <div className="flex-1 min-h-64 space-y-3 overflow-y-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-sm rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-900"
                }`}
              >
                {msg.role === "assistant" && (
                  <p className="text-xs font-semibold mb-1 text-blue-500">
                    AI アシスタント
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
                考え中...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 入力エリア */}
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          {error && (
            <p className="text-red-600 text-xs mb-2">{error}</p>
          )}
          <form onSubmit={handleSend} className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={thinking || creating}
              placeholder="回答を入力... (Enterで送信、Shift+Enterで改行)"
              rows={2}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-400"
            />
            <button
              type="submit"
              disabled={thinking || creating || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              {thinking ? "考え中..." : "送信"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
