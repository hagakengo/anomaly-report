"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { getStats, Stats } from "../lib/api";

const SEVERITY_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#10b981" };
const STATUS_COLORS = { open: "#94a3b8", in_progress: "#3b82f6", resolved: "#10b981" };
const STATUS_LABEL = { open: "未対応", in_progress: "対応中", resolved: "解決済み" };
const SEVERITY_LABEL = { high: "高", medium: "中", low: "低" };
const BAR_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
      <p className="text-xs font-semibold text-slate-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    getStats()
      .then(setStats)
      .catch((e) => {
        if (e instanceof Error && e.message === "UNAUTHORIZED") { logout(); router.push("/login"); }
        else setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      })
      .finally(() => setLoading(false));
  }, [user, router, logout]);

  const severityData = stats
    ? (["high", "medium", "low"] as const).map((k) => ({
        name: SEVERITY_LABEL[k],
        value: stats.by_severity[k] ?? 0,
        color: SEVERITY_COLORS[k],
      }))
    : [];

  const statusData = stats
    ? (["open", "in_progress", "resolved"] as const).map((k) => ({
        name: STATUS_LABEL[k],
        value: stats.by_status[k] ?? 0,
        color: STATUS_COLORS[k],
      }))
    : [];

  const total = stats ? (stats.by_status.open + stats.by_status.in_progress + stats.by_status.resolved) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">統計ダッシュボード</h1>
              <p className="text-xs text-slate-400 hidden sm:block">報告データの集計・分析</p>
            </div>
          </div>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors">
            ← 一覧に戻る
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
            <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-sm">読み込み中...</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">⚠ {error}</div>
        )}

        {stats && (
          <>
            {/* 再発警告 */}
            {stats.recurring_machines.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="text-amber-500 text-lg shrink-0">⚠</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-800 mb-1">再発が検出されました（過去30日間）</p>
                    <div className="flex flex-wrap gap-2">
                      {stats.recurring_machines.map((m) => (
                        <span key={m.machine_name} className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-full">
                          {m.machine_name} — {m.count}件
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* サマリーカード */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="総報告数" value={total} color="text-slate-800" />
              <StatCard label="未対応" value={stats.by_status.open} color="text-slate-600" sub="対応待ち" />
              <StatCard label="対応中" value={stats.by_status.in_progress} color="text-blue-600" sub="作業中" />
              <StatCard label="解決済み" value={stats.by_status.resolved} color="text-emerald-600" sub="完了" />
            </div>

            {/* 月別推移 + 重要度内訳 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">月別報告件数</h2>
                {stats.monthly.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-slate-300 text-sm">データなし</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.monthly} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                        formatter={(v: unknown) => [`${v}件`, "報告数"]}
                      />
                      <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">重要度別</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={severityData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                      {severityData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend
                      formatter={(value) => <span style={{ fontSize: 12, color: "#64748b" }}>{value}</span>}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                      formatter={(v: unknown) => [`${v}件`]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ステータス内訳 + 機器別ランキング */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">ステータス別</h2>
                <div className="space-y-3">
                  {statusData.map((s) => (
                    <div key={s.name}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-slate-600">{s.name}</span>
                        <span className="text-xs font-bold text-slate-800">{s.value}件</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: total > 0 ? `${(s.value / total) * 100}%` : "0%",
                            backgroundColor: s.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">機器別報告数（上位10件）</h2>
                {stats.top_machines.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-slate-300 text-sm">データなし</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stats.top_machines} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                      <YAxis type="category" dataKey="machine_name" tick={{ fontSize: 11, fill: "#64748b" }} width={80} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                        formatter={(v: unknown) => [`${v}件`, "報告数"]}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {stats.top_machines.map((_, i) => (
                          <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
