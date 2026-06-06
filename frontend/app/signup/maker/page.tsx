"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";

export default function MakerSignupPage() {
  const { signupMaker } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signupMaker(email, username, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* 左パネル */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-700 via-violet-800 to-slate-900 flex-col justify-between p-12 text-white">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">異常報告管理システム</span>
              <span className="ml-2 bg-white/20 text-white text-xs font-medium px-2 py-0.5 rounded-full">メーカー</span>
            </div>
          </div>
          <h2 className="text-4xl font-bold leading-tight mb-4">
            メーカー担当者として<br />参加する
          </h2>
          <p className="text-violet-200 text-base leading-relaxed">
            現場からの異常報告を一元確認。<br />
            チャットで迅速にサポートを提供します。
          </p>
        </div>
        <div className="space-y-4">
          {[
            { icon: "✦", text: "全報告をリアルタイムで閲覧" },
            { icon: "✦", text: "チャットで現場に直接対応" },
            { icon: "✦", text: "新規報告の即時通知を受信" },
          ].map((f) => (
            <div key={f.text} className="flex items-center gap-3 text-violet-100">
              <span className="text-violet-400 text-xs">{f.icon}</span>
              <span className="text-sm">{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 右パネル */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">メーカー登録</h1>
              <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                メーカー
              </span>
            </div>
            <p className="text-sm text-slate-500">メーカー担当者アカウントを作成します</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6 flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                メールアドレス
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                placeholder="example@maker.co.jp"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                お名前
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                placeholder="田中 一郎"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                パスワード
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                placeholder="8文字以上推奨"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-sm hover:shadow-violet-200 hover:shadow-md"
            >
              {loading ? "登録中..." : "アカウントを作成"}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm text-slate-500">
            <p>
              現場ユーザーの方は{" "}
              <Link href="/signup" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                こちら
              </Link>
            </p>
            <p>
              すでにアカウントをお持ちですか？{" "}
              <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                サインイン
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
