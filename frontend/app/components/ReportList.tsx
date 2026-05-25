"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getReports,
  updateReportStatus,
  deleteReport,
  downloadPdf,
  getFileUrl,
  getUnreadSummary,
  Report,
  Status,
  ReportFilters,
  MessageSummary,
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  requestNotificationPermission,
  computeUnreadCounts,
  detectNewMessages,
  showBrowserNotification,
  NewMessageItem,
} from "../lib/notifications";

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

function Toast({
  toast,
  onDismiss,
  onNavigate,
}: {
  toast: NewMessageItem & { key: string };
  onDismiss: (key: string) => void;
  onNavigate: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.key), 5000);
    return () => clearTimeout(t);
  }, [toast.key, onDismiss]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex items-start gap-3 animate-in slide-in-from-right-4">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-blue-600">
          新着メッセージ — 報告 #{toast.report_id}
        </p>
        <p className="text-sm text-gray-700 mt-0.5 truncate">
          <span className="font-medium">{toast.sender_name}</span>:{" "}
          {toast.preview}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onNavigate}
          className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 py-1 rounded-lg transition-colors"
        >
          チャットを見る
        </button>
        <button
          onClick={() => onDismiss(toast.key)}
          className="text-gray-400 hover:text-gray-600 ml-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function ReportList() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [filterInput, setFilterInput] = useState({ machine_name: "", location: "", status: "" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [toasts, setToasts] = useState<(NewMessageItem & { key: string })[]>([]);
  const prevSummaryRef = useRef<MessageSummary[]>([]);

  const dismissToast = (key: string) =>
    setToasts((prev) => prev.filter((t) => t.key !== key));

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReports(filters);
      setReports(data);
    } catch (e) {
      if (e instanceof Error && e.message === "UNAUTHORIZED") {
        logout();
        router.push("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [filters, logout, router]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // 通知許可 + 未読サマリーポーリング
  useEffect(() => {
    requestNotificationPermission();

    const pollSummary = async () => {
      try {
        const next = await getUnreadSummary();
        const newItems = detectNewMessages(prevSummaryRef.current, next);

        if (newItems.length > 0) {
          if (document.visibilityState === "visible") {
            // タブがアクティブ → 画面内トースト
            setToasts((prev) => [
              ...prev,
              ...newItems.map((item) => ({
                ...item,
                key: `${item.report_id}-${item.latest_message_id}`,
              })),
            ]);
          } else {
            // タブが非アクティブ → OS ブラウザ通知
            for (const item of newItems) {
              showBrowserNotification(
                `新着メッセージ (報告 #${item.report_id})`,
                `${item.sender_name}: ${item.preview}`,
                item.report_id,
              );
            }
          }
        }

        prevSummaryRef.current = next;
        setUnreadCounts(computeUnreadCounts(next));
      } catch {
        // ポーリングエラーはサイレントに無視
      }
    };

    pollSummary();
    const interval = setInterval(pollSummary, 10_000);
    return () => clearInterval(interval);
  }, []);

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

  const handleDownloadPdf = async (id: number) => {
    try {
      await downloadPdf(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "PDF取得エラー");
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
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
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-gray-600">
                {user.username}
                {isAdmin && (
                  <span className="ml-1.5 bg-purple-100 text-purple-700 text-xs font-medium px-1.5 py-0.5 rounded">
                    管理者
                  </span>
                )}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-3 py-1 transition-colors"
            >
              ログアウト
            </button>
            <Link
              href="/reports/new"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <span className="text-base leading-none">＋</span>
              新規報告
            </Link>
          </div>
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
                    <th className="px-4 py-3 text-right">操作</th>
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
                        {isAdmin ? (
                          <select
                            value={report.status}
                            onChange={(e) => handleStatusChange(report.id, e.target.value as Status)}
                            className={`text-xs font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${STATUS_CLASS[report.status]}`}
                          >
                            <option value="open">未対応</option>
                            <option value="in_progress">対応中</option>
                            <option value="resolved">解決済み</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[report.status]}`}>
                            {STATUS_LABEL[report.status]}
                          </span>
                        )}
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
                          {/* チャット: 全ユーザー */}
                          <Link
                            href={`/reports/${report.id}/chat`}
                            className="relative text-xs text-gray-600 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded px-2 py-1 transition-colors"
                          >
                            チャット
                            {unreadCounts[report.id] ? (
                              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
                                {unreadCounts[report.id]}
                              </span>
                            ) : null}
                          </Link>

                          {/* 以下 admin のみ */}
                          {isAdmin && (
                            <>
                              <Link
                                href={`/reports/${report.id}/edit`}
                                className="text-xs text-gray-600 hover:text-blue-600 border border-gray-200 hover:border-blue-300 rounded px-2 py-1 transition-colors"
                              >
                                編集
                              </Link>
                              <button
                                onClick={() => handleDownloadPdf(report.id)}
                                className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded px-2 py-1 transition-colors"
                              >
                                PDF
                              </button>
                              <button
                                onClick={() => handleDelete(report.id)}
                                className="text-xs text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded px-2 py-1 transition-colors"
                              >
                                削除
                              </button>
                            </>
                          )}
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

      {/* トースト通知 (右下固定) */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 max-w-sm w-full">
          {toasts.map((toast) => (
            <Toast
              key={toast.key}
              toast={toast}
              onDismiss={dismissToast}
              onNavigate={() => {
                dismissToast(toast.key);
                router.push(`/reports/${toast.report_id}/chat`);
              }}
            />
          ))}
        </div>
      )}

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
