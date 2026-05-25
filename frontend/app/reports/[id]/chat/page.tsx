"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { getMessages, sendMessage, Message } from "../../../lib/api";
import {
  markAsRead,
  showBrowserNotification,
  requestNotificationPermission,
} from "../../../lib/notifications";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const reportId = Number(params.id);
  const { user, logout } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLatestIdRef = useRef<number>(0);

  const fetchMessages = useCallback(async () => {
    try {
      const msgs = await getMessages(reportId);
      setMessages(msgs);
      setLoadError(null);

      if (msgs.length === 0) return;
      const latest = msgs[msgs.length - 1];

      // 自分以外のメッセージで、前回より新しければ通知
      if (
        latest.id > prevLatestIdRef.current &&
        latest.sender_id !== user?.userId
      ) {
        showBrowserNotification(
          `新着メッセージ (報告 #${reportId})`,
          `${latest.sender_name}: ${latest.content.slice(0, 50)}`,
          reportId,
        );
      }
      prevLatestIdRef.current = latest.id;

      // 既読マーク (このページを開いている間は常に既読)
      markAsRead(reportId, latest.id);
    } catch (e) {
      if (e instanceof Error && e.message === "UNAUTHORIZED") {
        logout();
        router.push("/login");
      } else {
        setLoadError(e instanceof Error ? e.message : "メッセージの取得に失敗しました");
      }
    }
  }, [reportId, user?.userId, logout, router]);

  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    requestNotificationPermission();
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [user, fetchMessages, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMessage(reportId, input.trim());
      setMessages((prev) => [...prev, msg]);
      markAsRead(reportId, msg.id);
      prevLatestIdRef.current = msg.id;
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信エラーが発生しました");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
  };

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
              報告 #{reportId} のチャット
            </h1>
            <p className="text-xs text-gray-500">管理者との問い合わせ</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 flex flex-col gap-4">
        {/* エラー (ロード失敗) */}
        {loadError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {loadError}
          </div>
        )}

        {/* メッセージスレッド */}
        <div className="flex-1 min-h-64 space-y-3 overflow-y-auto">
          {messages.length === 0 && !loadError && (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              メッセージはまだありません。最初のメッセージを送信してください。
            </div>
          )}
          {messages.map((msg) => {
            const isOwn = msg.sender_id === user?.userId;
            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm ${
                    isOwn
                      ? "bg-blue-600 text-white"
                      : "bg-white border border-gray-200 text-gray-900"
                  }`}
                >
                  {!isOwn && (
                    <p className="text-xs font-medium mb-1 text-gray-500">
                      {msg.sender_name}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isOwn ? "text-blue-100" : "text-gray-400"
                    }`}
                  >
                    {msg.created_at.replace("T", " ")}
                  </p>
                </div>
              </div>
            );
          })}
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
              placeholder="メッセージを入力... (Enterで送信、Shift+Enterで改行)"
              rows={2}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              {sending ? "送信中..." : "送信"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
