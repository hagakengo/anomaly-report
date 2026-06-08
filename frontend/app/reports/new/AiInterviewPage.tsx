"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import {
  createReport,
  getInterviewSuggestions,
  getCheckItems,
  getCheckItemMachines,
  InterviewSuggestions,
  CheckItem,
} from "../../lib/api";

const SYMPTOM_OPTIONS = [
  "動作停止",
  "動作不良・誤作動",
  "異音・異常振動",
  "過熱",
  "液体漏れ",
  "エラーコード表示",
  "速度低下・出力不足",
  "その他",
];

const SEVERITY_OPTIONS = [
  { value: "high",   label: "高",   sub: "即時対応が必要",   color: "bg-red-500 border-red-500 text-white" },
  { value: "medium", label: "中",   sub: "早期対応が必要",   color: "bg-amber-400 border-amber-400 text-white" },
  { value: "low",    label: "低",   sub: "経過観察で可",     color: "bg-emerald-500 border-emerald-500 text-white" },
];

type Phase = "machine_select" | "pre_check" | "location" | "symptom" | "detail" | "severity";

export default function AiInterviewPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [phase, setPhase] = useState<Phase>("machine_select");

  // 機器選択
  const [machines, setMachines] = useState<string[]>([]);
  const [selectedMachine, setSelectedMachine] = useState("");
  const [customMachine, setCustomMachine] = useState("");

  // 事前確認
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [checkResults, setCheckResults] = useState<Record<number, string>>({});
  const [checkSummary, setCheckSummary] = useState("");

  // ヒアリング収集データ
  const [location, setLocation] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const [severity, setSeverity] = useState("");

  // 提案
  const [suggestions, setSuggestions] = useState<InterviewSuggestions>({ machine_names: [], locations: [] });

  const [submitting, setSubmitting] = useState(false);
  const [createdReport, setCreatedReport] = useState<{ id: number; machine_name: string; severity: string } | null>(null);

  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  useEffect(() => {
    getInterviewSuggestions().then(setSuggestions).catch(() => {});
    getCheckItemMachines().then(setMachines).catch(() => {});
  }, []);

  // ─── 機器選択完了 ──────────────────────────────────────────────────
  const handleMachineSelect = async () => {
    const machine = customMachine.trim() || selectedMachine;
    if (!machine) return;
    const items = await getCheckItems(machine).catch(() => []);
    setCheckItems(items);
    setSelectedMachine(machine);
    setPhase(items.length > 0 ? "pre_check" : "location");
  };

  // ─── 事前確認完了 ──────────────────────────────────────────────────
  const handlePreCheckComplete = () => {
    const summary = checkItems
      .map((item) => `・${item.content}：${checkResults[item.id] ?? "未確認"}`)
      .join("\n");
    setCheckSummary(summary);
    setPhase("location");
  };

  // ─── 症状トグル ────────────────────────────────────────────────────
  const toggleSymptom = (s: string) =>
    setSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  // ─── 報告書作成 ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const loc = customLocation.trim() || location;
    if (!loc || symptoms.length === 0 || !severity) return;
    setSubmitting(true);
    try {
      const lines = [
        `【症状】${symptoms.join("・")}`,
        detail.trim() ? `【詳細】${detail.trim()}` : "",
        checkSummary ? `【事前確認】\n${checkSummary}` : "",
      ].filter(Boolean).join("\n");

      const fd = new FormData();
      fd.append("machine_name", selectedMachine);
      fd.append("location", loc);
      fd.append("description", lines);
      fd.append("severity", severity);
      const report = await createReport(fd);
      setCreatedReport({ id: report.id, machine_name: report.machine_name, severity: report.severity });
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        logout();
        router.push("/login");
      }
    } finally { setSubmitting(false); }
  };

  const header = (title: string, sub: string, onBack: () => void) => (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm border border-gray-200 rounded px-3 py-1 transition-colors">← 戻る</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900">{title}</h1>
          <p className="text-xs text-gray-400">{sub}</p>
        </div>
        <button onClick={() => router.push("/reports/new/manual")} className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0">手動入力</button>
      </div>
    </header>
  );

  // ─── 完了画面 ──────────────────────────────────────────────────────
  if (createdReport) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-bold text-gray-900">報告書を作成しました</h2>
        <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-left space-y-1">
          <p className="text-gray-600"><span className="font-medium text-gray-800">報告 #{createdReport.id}</span> — {createdReport.machine_name}</p>
          <p className="text-gray-500">重要度：{SEVERITY_OPTIONS.find((s) => s.value === createdReport.severity)?.label ?? createdReport.severity}</p>
        </div>
        <p className="text-sm text-gray-500">管理者へリアルタイム通知を送信しました。</p>
        <div className="flex gap-3">
          <button onClick={() => router.push(`/reports/${createdReport.id}/chat`)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">チャットで追記</button>
          <button onClick={() => router.push("/")} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-lg transition-colors">一覧に戻る</button>
        </div>
      </div>
    </div>
  );

  // ─── 機器選択 ──────────────────────────────────────────────────────
  if (phase === "machine_select") {
    const effective = customMachine.trim() || selectedMachine;
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {header("機器を選択", "異常が発生した機器を選んでください", () => router.push("/"))}
        <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8 space-y-5">
          {machines.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">過去の機器から選ぶ</p>
              <div className="flex flex-wrap gap-2">
                {machines.map((m) => (
                  <button key={m} onClick={() => { setSelectedMachine(m); setCustomMachine(""); }}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${selectedMachine === m && !customMachine ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700">{machines.length > 0 ? "または新しい機器名を入力" : "機器名を入力"}</p>
            <input type="text" value={customMachine}
              onChange={(e) => { setCustomMachine(e.target.value); setSelectedMachine(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey && effective) handleMachineSelect(); }}
              placeholder="例：ポンプA（Shift+Enterで確定）"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={handleMachineSelect} disabled={!effective}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            {effective ? `「${effective}」で進む →` : "機器を選択または入力してください"}
          </button>
        </main>
      </div>
    );
  }

  // ─── 事前確認 ──────────────────────────────────────────────────────
  if (phase === "pre_check") {
    const allAnswered = checkItems.every((item) => checkResults[item.id]);
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {header(`事前確認 — ${selectedMachine}`, "以下の項目を確認してから報告を開始してください", () => { setPhase("machine_select"); setCheckResults({}); })}
        <main className="flex-1 max-w-xl mx-auto w-full px-4 py-6 space-y-3">
          {checkItems.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <p className="text-sm font-semibold text-gray-800 flex-1">{item.content}</p>
                {item.machine_name == null && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">共通</span>}
              </div>
              <div className="flex gap-2">
                {["問題なし", "要確認", "異常あり"].map((opt) => (
                  <button key={opt} onClick={() => setCheckResults((prev) => ({ ...prev, [item.id]: opt }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      checkResults[item.id] === opt
                        ? opt === "問題なし" ? "bg-emerald-500 text-white border-emerald-500"
                          : opt === "要確認" ? "bg-amber-400 text-white border-amber-400"
                          : "bg-red-500 text-white border-red-500"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                    }`}>{opt}</button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={handlePreCheckComplete} disabled={!allAnswered}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            {allAnswered ? "確認完了 — 次へ →" : "すべての項目を選択してください"}
          </button>
        </main>
      </div>
    );
  }

  // ─── 場所選択 ──────────────────────────────────────────────────────
  if (phase === "location") {
    const effective = customLocation.trim() || location;
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {header(`場所を選択 — ${selectedMachine}`, "異常が発生した場所を選んでください", () => setPhase(checkItems.length > 0 ? "pre_check" : "machine_select"))}
        <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8 space-y-5">
          {suggestions.locations.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-700">過去の場所から選ぶ</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.locations.map((loc) => (
                  <button key={loc} onClick={() => { setLocation(loc); setCustomLocation(""); }}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${location === loc && !customLocation ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"}`}>
                    {loc}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700">{suggestions.locations.length > 0 ? "または直接入力" : "場所を入力"}</p>
            <input type="text" value={customLocation}
              onChange={(e) => { setCustomLocation(e.target.value); setLocation(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && effective) setPhase("symptom"); }}
              placeholder="例：第1工場 北側、B棟2F"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={() => { if (effective) setPhase("symptom"); }} disabled={!effective}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            {effective ? "次へ →" : "場所を選択または入力してください"}
          </button>
        </main>
      </div>
    );
  }

  // ─── 症状選択 ──────────────────────────────────────────────────────
  if (phase === "symptom") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {header(`症状を選択 — ${selectedMachine}`, "当てはまる症状をすべて選んでください（複数可）", () => setPhase("location"))}
        <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {SYMPTOM_OPTIONS.map((s) => (
                <button key={s} onClick={() => toggleSymptom(s)}
                  className={`py-3 px-4 rounded-xl text-sm font-medium border transition-colors text-left ${symptoms.includes(s) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-200 hover:border-indigo-400"}`}>
                  {symptoms.includes(s) ? "✓ " : ""}{s}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setPhase("detail")} disabled={symptoms.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            {symptoms.length > 0 ? `「${symptoms.join("・")}」で次へ →` : "症状を1つ以上選んでください"}
          </button>
        </main>
      </div>
    );
  }

  // ─── 詳細入力 ──────────────────────────────────────────────────────
  if (phase === "detail") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {header(`詳細を入力 — ${selectedMachine}`, "補足情報があれば入力してください（任意）", () => setPhase("symptom"))}
        <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700">補足・エラーコードなど</p>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={5}
              placeholder="例：エラーコード E-04 が表示されている、昨日から断続的に発生..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          <button onClick={() => setPhase("severity")}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
            次へ →
          </button>
          <button onClick={() => setPhase("severity")} className="w-full text-gray-400 text-sm py-1">スキップ</button>
        </main>
      </div>
    );
  }

  // ─── 重要度選択 ────────────────────────────────────────────────────
  const loc = customLocation.trim() || location;
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {header(`重要度を選択 — ${selectedMachine}`, "この異常の緊急度を選んでください", () => setPhase("detail"))}
      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8 space-y-5">
        {/* 確認サマリー */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
          <p className="font-semibold text-gray-700 text-xs uppercase tracking-wide text-slate-400">入力内容の確認</p>
          <div className="space-y-1">
            <p><span className="text-gray-400 w-14 inline-block">機器</span><span className="font-medium text-gray-800">{selectedMachine}</span></p>
            <p><span className="text-gray-400 w-14 inline-block">場所</span><span className="font-medium text-gray-800">{loc}</span></p>
            <p><span className="text-gray-400 w-14 inline-block">症状</span><span className="font-medium text-gray-800">{symptoms.join("・")}</span></p>
            {detail && <p><span className="text-gray-400 w-14 inline-block">詳細</span><span className="text-gray-700">{detail}</span></p>}
          </div>
        </div>

        <div className="space-y-3">
          {SEVERITY_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setSeverity(opt.value)}
              className={`w-full py-4 rounded-xl text-sm font-semibold border-2 transition-colors flex items-center gap-4 px-5 ${
                severity === opt.value ? opt.color : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
              }`}>
              <span className="text-lg font-bold w-6">{opt.label}</span>
              <span className={severity === opt.value ? "text-white/80" : "text-gray-400"}>{opt.sub}</span>
            </button>
          ))}
        </div>

        <button onClick={handleSubmit} disabled={!severity || submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-colors">
          {submitting ? "報告書を作成中..." : "報告書を作成する"}
        </button>
      </main>
    </div>
  );
}
