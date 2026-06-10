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
  getWsBase,
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

const SEVERITY_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };
const SEVERITY_CLASS: Record<string, string> = {
  high: "bg-red-100 text-red-700 ring-1 ring-red-200",
  medium: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  low: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
};
const SEVERITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};
const STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  in_progress: "対応中",
  resolved: "解決済み",
};
const STATUS_CLASS: Record<string, string> = {
  open: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  in_progress: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  resolved: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
};

interface NewReportToast {
  key: string;
  id: number;
  machine_name: string;
  location: string;
  severity: string;
}

function NewReportToastItem({ toast, onDismiss, onNavigate }: {
  toast: NewReportToast;
  onDismiss: (key: string) => void;
  onNavigate: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.key), 8000);
    return () => clearTimeout(t);
  }, [toast.key, onDismiss]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl px-4 py-3.5 flex items-start gap-3">
      <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${SEVERITY_DOT[toast.severity] ?? "bg-slate-400"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-indigo-600 mb-0.5">新規異常報告</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{toast.machine_name}</p>
        <p className="text-xs text-slate-400 truncate">{toast.location}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onNavigate} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
          確認
        </button>
        <button onClick={() => onDismiss(toast.key)} className="text-slate-300 hover:text-slate-500 ml-0.5 text-lg leading-none">×</button>
      </div>
    </div>
  );
}

function MessageToast({ toast, onDismiss, onNavigate }: {
  toast: NewMessageItem & { key: string };
  onDismiss: (key: string) => void;
  onNavigate: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.key), 5000);
    return () => clearTimeout(t);
  }, [toast.key, onDismiss]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl px-4 py-3.5 flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 text-xs font-bold text-indigo-600">
        {toast.sender_name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-indigo-600 mb-0.5">報告 #{toast.report_id}</p>
        <p className="text-sm text-slate-700 truncate">
          <span className="font-semibold">{toast.sender_name}</span>: {toast.preview}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onNavigate} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
          返信
        </button>
        <button onClick={() => onDismiss(toast.key)} className="text-slate-300 hover:text-slate-500 ml-0.5 text-lg leading-none">×</button>
      </div>
    </div>
  );
}

export default function ReportList() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const isMaker = user?.role === "maker";

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [filterInput, setFilterInput] = useState({
    machine_name: "", location: "", status: "", severity: "",
    date_from: "", date_to: "", sort_by: "reported_at", sort_order: "desc" as "asc" | "desc",
    company_name: "",
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [toasts, setToasts] = useState<(NewMessageItem & { key: string })[]>([]);
  const [newReportToasts, setNewReportToasts] = useState<NewReportToast[]>([]);
  const prevSummaryRef = useRef<MessageSummary[]>([]);
  const isFirstPollRef = useRef(true);
  const isInitialLoadRef = useRef(true);

  const dismissNewReportToast = (key: string) =>
    setNewReportToasts((prev) => prev.filter((t) => t.key !== key));
  const dismissToast = (key: string) =>
    setToasts((prev) => prev.filter((t) => t.key !== key));

  const fetchReports = useCallback(async () => {
    if (isInitialLoadRef.current) setLoading(true);
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
      isInitialLoadRef.current = false;
      setLoading(false);
    }
  }, [filters, logout, router]);

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 30_000);
    return () => clearInterval(interval);
  }, [fetchReports]);

  // reportsが更新されたとき、現存しないIDをdismissedIdsから削除する
  useEffect(() => {
    if (reports.length === 0) return;
    const validIds = new Set(reports.map((r) => r.id));
    setDismissedIds((prev) => {
      const cleaned = new Set([...prev].filter((id) => validIds.has(id)));
      if (cleaned.size !== prev.size) {
        localStorage.setItem("dismissed_new_reports", JSON.stringify([...cleaned]));
        return cleaned;
      }
      return prev;
    });
  }, [reports]);

  useEffect(() => {
    requestNotificationPermission();
    const pollSummary = async () => {
      try {
        const next = await getUnreadSummary();
        if (!isFirstPollRef.current) {
          const newItems = detectNewMessages(prevSummaryRef.current, next);
          if (newItems.length > 0) {
            if (document.visibilityState === "visible") {
              setToasts((prev) => [
                ...prev,
                ...newItems.map((item) => ({ ...item, key: `${item.report_id}-${item.latest_message_id}` })),
              ]);
            } else {
              for (const item of newItems) {
                showBrowserNotification(`新着メッセージ (報告 #${item.report_id})`, `${item.sender_name}: ${item.preview}`, item.report_id);
              }
            }
          }
        }
        isFirstPollRef.current = false;
        prevSummaryRef.current = next;
        setUnreadCounts(computeUnreadCounts(next));
      } catch { /* サイレント */ }
    };
    pollSummary();
    const interval = setInterval(pollSummary, 10_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return;
    const wsUrl = `${getWsBase()}/ws/notifications`;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_report" && data.report) {
            const r = data.report;
            const key = `nr-${r.id}-${Date.now()}`;
            setNewReportToasts((prev) => [...prev, { key, id: r.id, machine_name: r.machine_name, location: r.location, severity: r.severity }]);
            setReports((prev) => prev.some((p) => p.id === r.id) ? prev : [r as Report, ...prev]);
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { reconnectTimer = setTimeout(connect, 3000); };
    };
    connect();
    return () => { clearTimeout(reconnectTimer); ws?.close(); };
  }, [isAdmin]);

  const handleFilterApply = () => setFilters({
    machine_name: filterInput.machine_name || undefined,
    location: filterInput.location || undefined,
    status: filterInput.status || undefined,
    severity: filterInput.severity || undefined,
    date_from: filterInput.date_from || undefined,
    sort_by: filterInput.sort_by,
    sort_order: filterInput.sort_order,
  });

  const handleColumnSort = (col: string) => {
    const newOrder = filters.sort_by === col && filters.sort_order === "desc" ? "asc" : "desc";
    const newFilters = { ...filters, sort_by: col, sort_order: newOrder as "asc" | "desc" };
    setFilters(newFilters);
    setFilterInput((f) => ({ ...f, sort_by: col, sort_order: newOrder as "asc" | "desc" }));
  };
  const handleFilterReset = () => {
    setFilterInput({ machine_name: "", location: "", status: "", severity: "", date_from: "", date_to: "", sort_by: "reported_at", sort_order: "desc", company_name: "" });
    setFilters({});
  };

  const handleStatusChange = async (id: number, status: Status) => {
    try {
      const updated = await updateReportStatus(id, status);
      setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e) { alert(e instanceof Error ? e.message : "更新エラー"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`報告 #${id} を削除しますか？`)) return;
    try {
      await deleteReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { alert(e instanceof Error ? e.message : "削除エラー"); }
  };

  const handleDownloadPdf = async (id: number) => {
    try { await downloadPdf(id); } catch (e) { alert(e instanceof Error ? e.message : "PDF取得エラー"); }
  };

  // 新着報告の既読管理
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("dismissed_new_reports");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const dismissNewReport = (id: number) => {
    setDismissedIds((prev) => {
      const next = new Set(prev).add(id);
      localStorage.setItem("dismissed_new_reports", JSON.stringify([...next]));
      return next;
    });
  };

  // 会社タブ（管理者・メーカー用）
  const [activeCompany, setActiveCompany] = useState<string | null>(null);
  const companies = (isAdmin || isMaker)
    ? Array.from(new Set(reports.map((r) => r.company_name).filter(Boolean) as string[])).sort()
    : [];
  const visibleReports = activeCompany
    ? reports.filter((r) => r.company_name === activeCompany)
    : reports;

  // Stats
  const stats = {
    total: reports.length,
    open: reports.filter((r) => r.status === "open").length,
    in_progress: reports.filter((r) => r.status === "in_progress").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">異常報告管理</h1>
              <p className="text-xs text-slate-400 hidden sm:block">現場の異常を一元管理</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user && (
              <div className="hidden sm:flex items-center gap-2 mr-1">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                  {user.username[0]}
                </div>
                <span className="text-sm font-medium text-slate-700">{user.username}</span>
                {isAdmin && (
                  <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2 py-0.5 rounded-full">管理者</span>
                )}
                {isMaker && (
                  <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-0.5 rounded-full">メーカー</span>
                )}
              </div>
            )}
            {(isAdmin || isMaker) && (
              <Link
                href="/settings"
                className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors hidden sm:inline-flex items-center gap-1"
              >
                設定
              </Link>
            )}
            <Link
              href="/stats"
              className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors hidden sm:inline-flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              統計
            </Link>
            <button
              onClick={() => { logout(); router.push("/login"); }}
              className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
            >
              ログアウト
            </button>
            {user?.role === "customer" && (
              <Link
                href="/reports/new"
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm"
              >
                <span className="text-base leading-none">＋</span>
                新規報告
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "全報告", value: stats.total, color: "text-slate-700", bg: "bg-white" },
            { label: "未対応", value: stats.open, color: "text-slate-600", bg: "bg-white", dot: "bg-slate-400" },
            { label: "対応中", value: stats.in_progress, color: "text-blue-600", bg: "bg-white", dot: "bg-blue-500" },
            { label: "解決済み", value: stats.resolved, color: "text-emerald-600", bg: "bg-white", dot: "bg-emerald-500" },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} rounded-xl border border-slate-200 px-4 py-3.5 shadow-sm`}>
              <div className="flex items-center gap-2 mb-1">
                {s.dot && <span className={`w-2 h-2 rounded-full ${s.dot}`} />}
                <span className="text-xs font-medium text-slate-400">{s.label}</span>
              </div>
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* 会社タブ（管理者・メーカーのみ） */}
        {(isAdmin || isMaker) && !loading && companies.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveCompany(null)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeCompany === null
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
              }`}
            >
              すべて ({reports.length})
            </button>
            {companies.map((company) => (
              <button
                key={company}
                onClick={() => setActiveCompany(company)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeCompany === company
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                {company} ({reports.filter((r) => r.company_name === company).length})
              </button>
            ))}
          </div>
        )}

        {/* 新着報告 */}
        {!loading && reports.slice(0, 5).some((r) => !dismissedIds.has(r.id)) && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">新着報告</h2>
              <span className="text-xs text-slate-400">直近5件</span>
            </div>
            <div className="divide-y divide-slate-50">
              {reports.slice(0, 5).filter((r) => !dismissedIds.has(r.id)).map((report) => (
                <div key={report.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group">
                  <Link href={`/reports/${report.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[report.severity] ?? "bg-slate-300"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 truncate">{report.machine_name}</span>
                      <span className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${SEVERITY_CLASS[report.severity]}`}>
                        {SEVERITY_LABEL[report.severity]}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 truncate">{report.location}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[report.status]}`}>
                      {STATUS_LABEL[report.status]}
                    </span>
                    <p className="text-xs text-slate-300 mt-0.5">{report.reported_at.replace("T", " ").slice(0, 16)}</p>
                  </div>
                  </Link>
                  <button
                    onClick={() => dismissNewReport(report.id)}
                    className="shrink-0 text-slate-200 hover:text-slate-500 text-lg leading-none opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                    title="確認済みにする"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* フィルター */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 shadow-sm">
          <div className="flex flex-wrap gap-3 items-end justify-between">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">機器名</label>
                <input
                  type="text"
                  value={filterInput.machine_name}
                  onChange={(e) => setFilterInput((f) => ({ ...f, machine_name: e.target.value }))}
                  placeholder="絞り込み..."
                  className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">場所</label>
                <input
                  type="text"
                  value={filterInput.location}
                  onChange={(e) => setFilterInput((f) => ({ ...f, location: e.target.value }))}
                  placeholder="絞り込み..."
                  className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">ステータス</label>
                <select
                  value={filterInput.status}
                  onChange={(e) => setFilterInput((f) => ({ ...f, status: e.target.value }))}
                  className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                >
                  <option value="">すべて</option>
                  <option value="open">未対応</option>
                  <option value="in_progress">対応中</option>
                  <option value="resolved">解決済み</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">重要度</label>
                <select
                  value={filterInput.severity}
                  onChange={(e) => setFilterInput((f) => ({ ...f, severity: e.target.value }))}
                  className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                >
                  <option value="">すべて</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">開始日</label>
                <input
                  type="date"
                  value={filterInput.date_from}
                  onChange={(e) => setFilterInput((f) => ({ ...f, date_from: e.target.value }))}
                  className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                />
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleFilterApply}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                適用
              </button>
              <button
                onClick={handleFilterReset}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                リセット
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <span>⚠</span> {error}
          </div>
        )}

        {/* テーブル */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm">読み込み中...</span>
            </div>
          ) : visibleReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">📋</div>
              <span className="text-sm font-medium">報告がありません</span>
              <span className="text-xs text-slate-300">フィルターを変更するか、新規報告を作成してください</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-14">No.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">機器名</th>
                    {(isAdmin || isMaker) && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-32">会社名</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">場所</th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-20 cursor-pointer select-none group/th"
                      onClick={() => handleColumnSort("severity")}
                    >
                      <span className="flex items-center gap-1">
                        重要度
                        <span className={`transition-opacity text-[10px] ${filters.sort_by === "severity" ? "opacity-100" : "opacity-0 group-hover/th:opacity-50"}`}>
                          {filters.sort_by === "severity" && filters.sort_order === "asc" ? "▲" : "▼"}
                        </span>
                      </span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-44 cursor-pointer select-none group/th"
                      onClick={() => handleColumnSort("status")}
                    >
                      <span className="flex items-center gap-1">
                        ステータス
                        <span className={`transition-opacity text-[10px] ${filters.sort_by === "status" ? "opacity-100" : "opacity-0 group-hover/th:opacity-50"}`}>
                          {filters.sort_by === "status" && filters.sort_order === "asc" ? "▲" : "▼"}
                        </span>
                      </span>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-36 cursor-pointer select-none group/th"
                      onClick={() => handleColumnSort("reported_at")}
                    >
                      <span className="flex items-center gap-1">
                        報告日時
                        <span className={`transition-opacity text-[10px] ${filters.sort_by === "reported_at" || !filters.sort_by ? "opacity-100" : "opacity-0 group-hover/th:opacity-50"}`}>
                          {filters.sort_order === "asc" && filters.sort_by === "reported_at" ? "▲" : "▼"}
                        </span>
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">担当者</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">添付</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleReports.map((report) => (
                    <tr key={report.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-4 py-3.5 font-mono text-xs">
                        <div className="relative inline-flex items-center gap-1">
                          <span className="text-slate-300">#{report.id}</span>
                          {unreadCounts[report.id] ? (
                            <Link
                              href={`/reports/${report.id}/chat`}
                              className="bg-red-500 hover:bg-red-600 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 transition-colors"
                              title="未読メッセージあり — チャットを開く"
                            >
                              {unreadCounts[report.id]}
                            </Link>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 max-w-[180px] truncate" title={report.machine_name}>
                        <Link href={`/reports/${report.id}`} className="font-semibold text-slate-800 hover:text-indigo-600 transition-colors">
                          {report.machine_name}
                        </Link>
                      </td>
                      {(isAdmin || isMaker) && (
                        <td className="px-4 py-3.5 text-xs text-slate-500 max-w-[120px] truncate" title={report.company_name ?? ""}>
                          {report.company_name ?? <span className="text-slate-200">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3.5 text-slate-500 text-xs max-w-[150px] truncate" title={report.location}>
                        {report.location}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${SEVERITY_CLASS[report.severity]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[report.severity]}`} />
                          {SEVERITY_LABEL[report.severity]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {(isAdmin || isMaker) ? (
                          <select
                            value={report.status}
                            onChange={(e) => handleStatusChange(report.id, e.target.value as Status)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${STATUS_CLASS[report.status]}`}
                          >
                            <option value="open">未対応</option>
                            <option value="in_progress">対応中</option>
                            <option value="resolved">解決済み</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[report.status]}`}>
                            {STATUS_LABEL[report.status]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                        {report.reported_at.replace("T", " ")}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {report.assignee_name ?? <span className="text-slate-200">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {report.file_path && report.file_type === "image" && (
                          <button onClick={() => setPreviewUrl(getFileUrl(report.file_path!))} className="text-indigo-500 hover:text-indigo-700 text-xs font-medium">
                            画像
                          </button>
                        )}
                        {report.file_path && report.file_type === "video" && (
                          <a href={getFileUrl(report.file_path)} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 text-xs font-medium">
                            動画
                          </a>
                        )}
                        {!report.file_path && <span className="text-slate-200 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {(isAdmin || isMaker) && (
                            <>
                              <Link
                                href={`/reports/${report.id}/edit`}
                                className="text-xs text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                              >
                                編集
                              </Link>
                              <button
                                onClick={() => handleDownloadPdf(report.id)}
                                className="text-xs text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                              >
                                PDF
                              </button>
                              <button
                                onClick={() => handleDelete(report.id)}
                                className="text-xs text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
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
          {!loading && visibleReports.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400 font-medium">
              {visibleReports.length} 件
            </div>
          )}
        </div>
      </main>

      {/* トースト通知 */}
      {(toasts.length > 0 || newReportToasts.length > 0) && (
        <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-50 max-w-sm w-full">
          {newReportToasts.map((toast) => (
            <NewReportToastItem
              key={toast.key}
              toast={toast}
              onDismiss={dismissNewReportToast}
              onNavigate={() => { dismissNewReportToast(toast.key); router.push(`/reports/${toast.id}/chat`); }}
            />
          ))}
          {toasts.map((toast) => (
            <MessageToast
              key={toast.key}
              toast={toast}
              onDismiss={dismissToast}
              onNavigate={() => { dismissToast(toast.key); router.push(`/reports/${toast.report_id}/chat`); }}
            />
          ))}
        </div>
      )}

      {/* 画像プレビュー */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-w-3xl max-h-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="添付画像" className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain" />
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-4 -right-4 bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg text-slate-600 hover:text-slate-900 font-bold text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
