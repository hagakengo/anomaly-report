"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createReport } from "../lib/api";

export default function NewReportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setPreviewUrl(null); setFileName(null); return; }
    const isVid = file.type.startsWith("video/");
    setIsVideo(isVid);
    setFileName(file.name);
    setPreviewUrl(isVid ? null : URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createReport(new FormData(e.currentTarget));
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録エラーが発生しました");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-900">新規異常報告</h1>
            <p className="text-xs text-slate-400">異常の内容を入力して登録してください</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5 flex items-center gap-2">
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 機器名 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">基本情報</h2>
            <div>
              <label htmlFor="machine_name" className="block text-sm font-semibold text-slate-700 mb-1.5">
                機器名 <span className="text-red-500">*</span>
              </label>
              <input
                id="machine_name"
                name="machine_name"
                type="text"
                required
                placeholder="例：ポンプA、コンベアB-3"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-semibold text-slate-700 mb-1.5">
                発生場所 <span className="text-red-500">*</span>
              </label>
              <input
                id="location"
                name="location"
                type="text"
                required
                placeholder="例：第1工場 B棟 2F"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* 異常内容 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">異常詳細</h2>
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-slate-700 mb-1.5">
                異常内容 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                placeholder="発見した異常の詳細を記入してください"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition resize-y"
              />
            </div>
            <div>
              <label htmlFor="severity" className="block text-sm font-semibold text-slate-700 mb-1.5">
                重要度
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "high", label: "高", desc: "即時対応", color: "peer-checked:bg-red-50 peer-checked:border-red-400 peer-checked:text-red-700" },
                  { value: "medium", label: "中", desc: "早期対応", color: "peer-checked:bg-amber-50 peer-checked:border-amber-400 peer-checked:text-amber-700" },
                  { value: "low", label: "低", desc: "経過観察", color: "peer-checked:bg-emerald-50 peer-checked:border-emerald-400 peer-checked:text-emerald-700" },
                ].map((opt) => (
                  <label key={opt.value} className="relative cursor-pointer">
                    <input type="radio" name="severity" value={opt.value} defaultChecked={opt.value === "medium"} className="peer sr-only" />
                    <div className={`border-2 border-slate-200 rounded-xl p-3 text-center transition-all ${opt.color} hover:border-slate-300`}>
                      <div className="text-sm font-bold">{opt.label}</div>
                      <div className="text-xs mt-0.5 text-slate-400">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ファイル */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">添付ファイル（任意）</h2>
            <input
              ref={fileRef}
              id="file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/mov,video/avi,video/webm"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-xl p-6 text-center transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-indigo-50 flex items-center justify-center mx-auto mb-2 transition-colors">
                <svg className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 group-hover:text-indigo-600 transition-colors">
                {fileName ?? "クリックしてファイルを選択"}
              </p>
              <p className="text-xs text-slate-400 mt-1">JPG / PNG / MP4 など（1ファイルまで）</p>
            </button>
            {previewUrl && !isVideo && (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="プレビュー" className="max-h-48 mx-auto rounded-xl object-contain border border-slate-200" />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-sm hover:shadow-indigo-200 hover:shadow-md"
            >
              {submitting ? "登録中..." : "報告を登録する"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-3 rounded-xl text-sm transition-colors"
            >
              キャンセル
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
