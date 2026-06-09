/**
 * 選択式ウィザードによる異常報告作成ページ。
 *
 * 設計思想：
 * 元々は Groq API（LLM チャット）で自由入力のヒアリングをしていたが、
 * 「入力が面倒」「何を入力すればいいか分からない」という UX 課題があった。
 * そのため「AI は選択肢でヒアリングする」方針に変更。
 * ステップ形式にすることで入力漏れを防ぎ、1画面1質問で迷わせない。
 *
 * ステップの流れ:
 *   機器選択 → 事前確認（チェック項目がある場合のみ） → 場所選択 → 症状選択 → 詳細入力 → 重要度選択 → 完了
 *
 * phase ステートで現在のステップを管理し、条件分岐でUIを切り替えている。
 * React でウィザードUIを実装する一般的なパターン。
 */
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

// 製造現場でよくある異常の症状リスト。
// 複数選択可能にすることで「異音かつ過熱」などの複合症状を表現できる。
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

// 重要度の選択肢。色付きボタンで視覚的に緊急度を伝える。
const SEVERITY_OPTIONS = [
  { value: "high",   label: "高",   sub: "即時対応が必要",   color: "bg-red-500 border-red-500 text-white" },
  { value: "medium", label: "中",   sub: "早期対応が必要",   color: "bg-amber-400 border-amber-400 text-white" },
  { value: "low",    label: "低",   sub: "経過観察で可",     color: "bg-emerald-500 border-emerald-500 text-white" },
];

// ウィザードの各ステップを型で定義する。
// TypeScript の Union Type を使うことで、不正な phase 値をコンパイル時に検出できる。
type Phase = "machine_select" | "pre_check" | "location" | "symptom" | "detail" | "severity";

export default function AiInterviewPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  // 現在のウィザードステップ
  const [phase, setPhase] = useState<Phase>("machine_select");

  // ステップ1: 機器選択
  const [machines, setMachines] = useState<string[]>([]);       // 過去の報告から取得した機器名リスト
  const [selectedMachine, setSelectedMachine] = useState("");   // 選択済み機器名
  const [customMachine, setCustomMachine] = useState("");        // 手入力の機器名

  // ステップ2: 事前確認（メーカー定義のチェックリスト）
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);            // チェック項目リスト
  const [checkResults, setCheckResults] = useState<Record<number, string>>({}); // 各項目の回答 { id: "問題なし"|"要確認"|"異常あり" }
  const [checkSummary, setCheckSummary] = useState("");          // 報告書に含める確認結果の文字列

  // ステップ3〜5: ヒアリング収集データ
  const [location, setLocation] = useState("");         // 選択した場所
  const [customLocation, setCustomLocation] = useState(""); // 手入力の場所
  const [symptoms, setSymptoms] = useState<string[]>([]);  // 選択した症状（複数可）
  const [detail, setDetail] = useState("");              // 補足詳細（任意）
  const [severity, setSeverity] = useState("");          // 重要度

  // バックエンドから取得した機器名・場所のサジェスト（過去の報告から抽出）
  const [suggestions, setSuggestions] = useState<InterviewSuggestions>({ machine_names: [], locations: [] });

  const [submitting, setSubmitting] = useState(false);
  // 報告書作成成功時に完了画面を表示するためのデータ
  const [createdReport, setCreatedReport] = useState<{ id: number; machine_name: string; severity: string } | null>(null);

  // 未ログインなら即リダイレクト
  useEffect(() => {
    if (!user) router.push("/login");
  }, [user, router]);

  // 初回マウント時にサジェストと機器名リストを取得する
  useEffect(() => {
    getInterviewSuggestions().then(setSuggestions).catch(() => {});
    getCheckItemMachines().then(setMachines).catch(() => {});
  }, []);

  // ─── 機器選択完了 ──────────────────────────────────────────────────
  const handleMachineSelect = async () => {
    // カスタム入力を優先（customMachine があればそちらを使う）
    const machine = customMachine.trim() || selectedMachine;
    if (!machine) return;
    // 選んだ機器のチェック項目を取得（機器固有 + 共通の両方が返る）
    const items = await getCheckItems(machine).catch(() => []);
    setCheckItems(items);
    setSelectedMachine(machine);
    // チェック項目が1件でもあれば事前確認フェーズへ、なければスキップして場所へ
    setPhase(items.length > 0 ? "pre_check" : "location");
  };

  // ─── 事前確認完了 ──────────────────────────────────────────────────
  const handlePreCheckComplete = () => {
    // 各チェック項目の回答を「・項目名：回答」の形式でまとめる
    // これを報告書の description に含めることで、メーカーが確認状況を把握できる
    const summary = checkItems
      .map((item) => `・${item.content}：${checkResults[item.id] ?? "未確認"}`)
      .join("\n");
    setCheckSummary(summary);
    setPhase("location");
  };

  // ─── 症状トグル ────────────────────────────────────────────────────
  // 既に選択済みなら除去（トグル）、未選択なら追加する
  const toggleSymptom = (s: string) =>
    setSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  // ─── 報告書作成 ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const loc = customLocation.trim() || location;
    if (!loc || symptoms.length === 0 || !severity) return;
    setSubmitting(true);
    try {
      // description（異常内容）を構造化テキストとして組み立てる。
      // 【症状】【詳細】【事前確認】のブロックに分けることで
      // メーカーが素早く状況を把握できるフォーマットにしている。
      // filter(Boolean) で空文字列のブロックを除去してから join する。
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
      // 認証エラーは強制ログアウト
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        logout();
        router.push("/login");
      }
    } finally { setSubmitting(false); }
  };

  /**
   * 各ステップ共通のヘッダーコンポーネント（関数として定義）。
   * React コンポーネントとして別ファイルに切り出してもよいが、
   * このページ内でしか使わないため関数として定義している。
   * onBack は各ステップの「戻る」動作が異なるため引数で受け取る。
   */
  const header = (title: string, sub: string, onBack: () => void) => (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm border border-gray-200 rounded px-3 py-1 transition-colors">← 戻る</button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900">{title}</h1>
          <p className="text-xs text-gray-400">{sub}</p>
        </div>
        {/* 手動入力へのリンク。router.push を使うのは、<a href> だとページ全体がリロードされてしまうため。 */}
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
    // チップ選択 or テキスト入力の両方を受け付け、どちらかが入力されていれば有効とする
    const effective = customMachine.trim() || selectedMachine;
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {header("機器を選択", "異常が発生した機器を選んでください", () => router.push("/"))}
        <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8 space-y-5">
          {/* 過去の報告から取得した機器名をチップで表示 */}
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
    // 全項目に回答済みかチェック
    const allAnswered = checkItems.every((item) => checkResults[item.id]);
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {header(`事前確認 — ${selectedMachine}`, "以下の項目を確認してから報告を開始してください", () => { setPhase("machine_select"); setCheckResults({}); })}
        <main className="flex-1 max-w-xl mx-auto w-full px-4 py-6 space-y-3">
          {checkItems.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <p className="text-sm font-semibold text-gray-800 flex-1">{item.content}</p>
                {/* machine_name == null（ゆるい等価）で undefined も null も「共通」と判定 */}
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
        {/* 戻り先はチェック項目の有無によって変わる */}
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

  // ─── 詳細入力（任意） ──────────────────────────────────────────────
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

  // ─── 重要度選択（最終ステップ） ────────────────────────────────────
  // 送信前に全入力内容を確認サマリーとして表示する。
  // ユーザーが内容を確認・訂正できる最後のチェックポイント。
  const loc = customLocation.trim() || location;
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {header(`重要度を選択 — ${selectedMachine}`, "この異常の緊急度を選んでください", () => setPhase("detail"))}
      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-8 space-y-5">
        {/* 送信前のサマリー確認 */}
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
