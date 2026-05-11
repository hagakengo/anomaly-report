"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getReports,
  updateReportStatus,
  deleteReport,
  getPdfUrl,
  getFileUrl,
  Report,
  Status,
  ReportFilters,
} from "../lib/api";

const SEVERITY_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};
const SEVERITY_CLASS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-orange-100 text-orange-700",
  low: "bg-green-100 text-green-700",
};

const STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  in_progress: "対応中",
  resolved: "解決済み",
};
const STATUS_CLASS: Record<string, string> = {
  open: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
};

export default function ReportList() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [filterInput, setFilterInput] = useState({ machine_name: "", location: "", status: "" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReports(filters);
      setReports(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleFilterApply = () => {
    setFilters({
      machine_name: filterInput.machine_name || undefined,
      location: filterInput.location || undefined,
      status: filterInput.status || undefined,
    });
  };

  const handleFilterReset = () => {
    setFilterInput({ machine_name: "", location: "", status: "" });
    setFilters({});
  };

  const handleStatusChange = async (id: number, status: Status) => {
    try {
      const updated = await updateReportStatus(id, status);
      setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新エラー");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`報告 #${id} を削除しますか？`)) return;
    try {
      await deleteReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "削除エラー");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">異常報告管理</h1>
            <p className="text-sm text-gray-500">現場の異常報告を一元管理</p>
          </div>
          <Link
            href="/reports/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <span className="text-base leading-none">＋</span>
            新規報告
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* フィルターバー */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">機器名</label>
              <input
                type="text"
                value={filterInput.machine_name}
                onChange={(e) => setFilterInput((f) => ({ ...f, machine_name: e.target.value }))}
                placeholder="機器名で絞り込み"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">場所</label>
              <input
                type="text"
                value={filterInput.location}
                onChange={(e) => setFilterInput((f) => ({ ...f, location: e.target.value }))}
                placeholder="場所で絞り込み"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ステータス</label>
              <select
                value={filterInput.status}
                onChange={(e) => setFilterInput((f) => ({ ...f, status: e.target.value }))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">すべて</option>
                <option value="open">未対応</option>
                <option value="in_progress">対応中</option>
                <option value="resolved">解決済み</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleFilterApply}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                絞り込む
              </button>
              <button
                onClick={handleFilterReset}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                リセット
              </button>
            </div>
          </div>
        </div>

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* テーブル */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
              読み込み中...
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
              <span className="text-4xl">📋</span>
              <span className="text-sm">報告がありません</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 w-12">No.</th>
                    <th className="px-4 py-3">機器名</th>
                    <th className="px-4 py-3">場所</th>
                    <th className="px-4 py-3 w-20">重要度</th>
                    <th className="px-4 py-3 w-40">ステータス</th>
                    <th className="px-4 py-3 w-36">報告日時</th>
                    <th className="px-4 py-3 w-40">添付</th>
                    <th className="px-4 py-3 w-36 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reports.map((report) => (
                    <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 font-mono">#{report.id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate" title={report.machine_name}>
                        {report.machine_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate" title={report.location}>
                        {report.location}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_CLASS[report.severity]}`}>
                          {SEVERITY_LABEL[report.severity]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={report.status}
                          onChange={(e) => handleStatusChange(report.id, e.target.value as Status)}
                          className={`text-xs font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${STATUS_CLASS[report.status]}`}
                        >
                          <option value="open">未対応</option>
                          <option value="in_progress">対応中</option>
                          <option value="resolved">解決済み</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {report.reported_at.replace("T", " ")}
                      </td>
                      <td className="px-4 py-3">
                        {report.file_path && report.file_type === "image" && (
                          <button
                            onClick={() => setPreviewUrl(getFileUrl(report.file_path!))}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            画像を表示
                          </button>
                        )}
                        {report.file_path && report.file_type === "video" && (
                          <a
                            href={getFileUrl(report.file_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs"
                          >
                            動画を開く
                          </a>
                        )}
                        {!report.file_path && <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={getPdfUrl(report.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded px-2 py-1 transition-colors"
                            title="PDF出力"
                          >
                            PDF
                          </a>
                          <button
                            onClick={() => handleDelete(report.id)}
                            className="text-xs text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded px-2 py-1 transition-colors"
                            title="削除"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && reports.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              {reports.length} 件
            </div>
          )}
        </div>
      </main>

      {/* 画像プレビューモーダル */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-3xl max-h-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="添付画像" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain" />
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg text-gray-700 hover:text-gray-900 font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
