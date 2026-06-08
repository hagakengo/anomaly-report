"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { getReport, getStatusLogs, getRecurrence, getStaff, assignReport, updateReportStatus, getFileUrl, Report, StatusLog, StaffUser, Status } from "../../lib/api";

const SEVERITY_LABEL: Record<string, string> = { high: "高（即時対応）", medium: "中（早期対応）", low: "低（経過観察）" };
const SEVERITY_CLASS: Record<string, string> = {
  high: "bg-red-100 text-red-700 ring-1 ring-red-200",
  medium: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  low: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
};
const SEVERITY_DOT: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500" };
const STATUS_LABEL: Record<string, string> = { open: "未対応", in_progress: "対応中", resolved: "解決済み" };
const STATUS_CLASS: Record<string, string> = {
  open: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  in_progress: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  resolved: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
};
const STATUS_ARROW: Record<string, string> = { open: "未対応", in_progress: "対応中", resolved: "解決済み" };

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = Number(params.id);
  const { user, logout } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const isMaker = user?.role === "maker";

  const [report, setReport] = useState<Report | null>(null);
  const [logs, setLogs] = useState<StatusLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recurrenceCount, setRecurrenceCount] = useState<number>(0);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    (async () => {
      try {
        const [r, l, rec] = await Promise.all([
          getReport(reportId),
          getStatusLogs(reportId),
          getRecurrence(reportId),
        ]);
        setReport(r);
        setLogs(l);
        setRecurrenceCount(rec.count);
        setAssigneeId(r.assignee_id);
        if (isAdmin || isMaker) {
          const s = await getStaff();
          setStaff(s);
        }
      } catch (e) {
        if (e instanceof Error && e.message === "UNAUTHORIZED") { logout(); router.push("/login"); }
        else setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [reportId, user, router, logout, isAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-sm">読み込み中...</span>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow p-8 text-center max-w-sm w-full">
          <p className="text-slate-500 text-sm mb-4">{error ?? "報告が見つかりません"}</p>
          <button onClick={() => router.push("/")} className="text-indigo-600 text-sm font-semibold hover:underline">
            一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push("/")} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">#{report.id}</span>
              <h1 className="text-base font-bold text-slate-900 truncate">{report.machine_name}</h1>
            </div>
            <p className="text-xs text-slate-400">{report.reported_at.replace("T", " ")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/reports/${report.id}/chat`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              チャット
            </Link>
            {(isAdmin || isMaker) && (
              <Link
                href={`/reports/${report.id}/edit`}
                className="text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                編集
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* 再発警告 */}
        {recurrenceCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-amber-500 text-lg shrink-0">⚠</span>
            <p className="text-sm text-amber-800">
              この機器では過去30日間に他に <strong>{recurrenceCount}件</strong> の異常報告があります（再発の可能性）
            </p>
          </div>
        )}

        {/* 基本情報 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">報告情報</h2>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${SEVERITY_CLASS[report.severity]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[report.severity]}`} />
                {SEVERITY_LABEL[report.severity]}
              </span>
              {(isAdmin || isMaker) ? (
                <select
                  value={report.status}
                  disabled={statusUpdating}
                  onChange={async (e) => {
                    setStatusUpdating(true);
                    try {
                      const updated = await updateReportStatus(report.id, e.target.value as Status);
                      setReport(updated);
                      const l = await getStatusLogs(report.id);
                      setLogs(l);
                    } catch (err) { alert(err instanceof Error ? err.message : "更新エラー"); }
                    finally { setStatusUpdating(false); }
                  }}
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${STATUS_CLASS[report.status]}`}
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
            </div>
          </div>
          <dl className="divide-y divide-slate-50">
            {[
              { label: "機器名", value: report.machine_name },
              { label: "発生場所", value: report.location },
            ].map((item) => (
              <div key={item.label} className="px-5 py-3 flex gap-4">
                <dt className="text-xs font-semibold text-slate-400 w-24 shrink-0 pt-0.5">{item.label}</dt>
                <dd className="text-sm text-slate-800 font-medium">{item.value}</dd>
              </div>
            ))}
            <div className="px-5 py-3 flex gap-4">
              <dt className="text-xs font-semibold text-slate-400 w-24 shrink-0 pt-0.5">異常内容</dt>
              <dd className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{report.description}</dd>
            </div>
            <div className="px-5 py-3 flex gap-4">
              <dt className="text-xs font-semibold text-slate-400 w-24 shrink-0 pt-0.5">報告日時</dt>
              <dd className="text-sm text-slate-600">{report.reported_at.replace("T", " ")}</dd>
            </div>
            {report.file_path && (
              <div className="px-5 py-3 flex gap-4">
                <dt className="text-xs font-semibold text-slate-400 w-24 shrink-0 pt-0.5">添付</dt>
                <dd>
                  {report.file_type === "image" ? (
                    <button
                      onClick={() => setPreviewUrl(getFileUrl(report.file_path!))}
                      className="text-sm text-indigo-600 hover:underline font-medium"
                    >
                      画像を表示
                    </button>
                  ) : (
                    <a
                      href={getFileUrl(report.file_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-600 hover:underline font-medium"
                    >
                      動画を開く
                    </a>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* 担当者 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">担当者</h2>
          </div>
          <div className="px-5 py-4">
            {(isAdmin || isMaker) ? (
              <div className="flex items-center gap-3">
                <select
                  value={assigneeId ?? ""}
                  onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                >
                  <option value="">未アサイン</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.username}（{s.role === "admin" ? "管理者" : "メーカー"}）
                    </option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    setAssigning(true);
                    try {
                      const updated = await assignReport(reportId, assigneeId);
                      setReport(updated);
                    } catch (e) { alert(e instanceof Error ? e.message : "エラー"); }
                    finally { setAssigning(false); }
                  }}
                  disabled={assigning}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {assigning ? "保存中..." : "保存"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-700">
                {report.assignee_name ?? <span className="text-slate-300">未アサイン</span>}
              </p>
            )}
          </div>
        </div>

        {/* ステータス変更履歴 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ステータス変更履歴</h2>
          </div>
          {logs.length === 0 ? (
            <div className="px-5 py-8 text-center text-slate-400 text-sm">
              変更履歴はまだありません
            </div>
          ) : (
            <div className="px-5 py-4">
              <ol className="relative border-l border-slate-200 space-y-5 ml-2">
                {logs.map((log) => (
                  <li key={log.id} className="ml-5">
                    <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[log.old_status]}`}>
                        {STATUS_ARROW[log.old_status]}
                      </span>
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[log.new_status]}`}>
                        {STATUS_ARROW[log.new_status]}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">
                        {log.changed_by} · {log.changed_at.replace("T", " ")}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* クイックリンク */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/reports/${report.id}/chat`}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-3 rounded-xl text-center transition-colors shadow-sm"
          >
            チャットで追記する
          </Link>
          <button
            onClick={() => router.push("/")}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 text-sm font-medium py-3 rounded-xl transition-colors"
          >
            一覧に戻る
          </button>
        </div>
      </main>

      {/* 画像プレビュー */}
      {previewUrl && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewUrl(null)}
        >
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
