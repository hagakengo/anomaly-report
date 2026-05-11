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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const isVid = file.type.startsWith("video/");
    setIsVideo(isVid);
    if (!isVid) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const formEl = e.currentTarget;
    const data = new FormData(formEl);
    try {
      await createReport(data);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録エラーが発生しました");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← 戻る
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">新規異常報告</h1>
            <p className="text-sm text-gray-500">異常の内容を入力して登録してください</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* 機器名 */}
          <div>
            <label htmlFor="machine_name" className="block text-sm font-medium text-gray-700 mb-1">
              機器名 <span className="text-red-500">*</span>
            </label>
            <input
              id="machine_name"
              name="machine_name"
              type="text"
              required
              placeholder="例：ポンプA、コンベアB-3"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 発生場所 */}
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              発生場所 <span className="text-red-500">*</span>
            </label>
            <input
              id="location"
              name="location"
              type="text"
              required
              placeholder="例：第1工場 B棟 2F"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 異常内容 */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              異常内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={4}
              placeholder="発見した異常の詳細を記入してください"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>

          {/* 重要度 */}
          <div>
            <label htmlFor="severity" className="block text-sm font-medium text-gray-700 mb-1">
              重要度
            </label>
            <select
              id="severity"
              name="severity"
              defaultValue="medium"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="high">高（即時対応が必要）</option>
              <option value="medium">中（早期対応が必要）</option>
              <option value="low">低（経過観察）</option>
            </select>
          </div>

          {/* ファイルアップロード */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              写真・動画（任意）
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
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
                className="text-sm text-blue-600 hover:underline"
              >
                ファイルを選択
              </button>
              <p className="text-xs text-gray-400 mt-1">
                JPG / PNG / MP4 など（1ファイルまで）
              </p>
              {/* プレビュー */}
              {previewUrl && !isVideo && (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="プレビュー" className="max-h-48 mx-auto rounded-lg object-contain" />
                </div>
              )}
              {isVideo && fileRef.current?.files?.[0] && (
                <p className="mt-2 text-xs text-gray-600">
                  動画: {fileRef.current.files[0].name}
                </p>
              )}
            </div>
          </div>

          {/* ボタン */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              {submitting ? "登録中..." : "報告を登録する"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg text-sm transition-colors"
            >
              キャンセル
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
