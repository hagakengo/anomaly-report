/**
 * バックエンド API との通信を担う関数群。
 *
 * API_BASE の決め方：
 *   - ローカル開発: 環境変数未設定 → "http://localhost:8000"
 *   - 本番(Vercel): NEXT_PUBLIC_API_URL に Railway の URL を設定する
 *   NEXT_PUBLIC_ プレフィックスが必要な理由: Next.js はこのプレフィックスがある
 *   環境変数だけをブラウザに公開する（それ以外はサーバー専用）。
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Severity = "high" | "medium" | "low";
export type Status = "open" | "in_progress" | "resolved";
export type FileType = "image" | "video";

export interface Report {
  id: number;
  machine_name: string;
  location: string;
  description: string;
  severity: Severity;
  status: Status;
  file_path: string | null;
  file_type: FileType | null;
  company_name: string | null;
  reported_at: string;
  user_id: number | null;
  assignee_id: number | null;
  assignee_name: string | null;
}

export interface ReportFilters {
  machine_name?: string;
  location?: string;
  status?: string;
  severity?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  company_name?: string;
}

export interface Message {
  id: number;
  report_id: number;
  sender_id: number;
  sender_name: string;
  content: string;
  created_at: string;
}

/**
 * sessionStorage から JWT トークンを取り出す。
 * sessionStorage を使う理由: localStorage はタブを閉じても残るが
 * sessionStorage はタブを閉じるとクリアされ、セキュリティが高い。
 * typeof window チェックは SSR（サーバーサイドレンダリング）時に
 * window が存在しないためのガード。
 */
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("auth_user");
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { token: string }).token;
  } catch {
    return null;
  }
}

/**
 * すべての API リクエストに付与する認証ヘッダーを生成する。
 * Bearer トークンは HTTP Authorization ヘッダーの標準的な形式。
 * バックエンドの get_current_user() がこのトークンを検証する。
 */
function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

/**
 * 報告一覧を取得する。フィルタ条件はクエリパラメータとして URL に付与する。
 * URLSearchParams ではなく new URL() を使うのは、
 * ベース URL が http:// か https:// かを問わずに扱えるため。
 * cache: "no-store" は Next.js の自動キャッシュを無効化する。
 * 一覧は常に最新データを取得したいのでキャッシュを使わない。
 */
export async function getReports(filters: ReportFilters = {}): Promise<Report[]> {
  const url = new URL(`${API_BASE}/reports`);
  if (filters.machine_name) url.searchParams.set("machine_name", filters.machine_name);
  if (filters.location) url.searchParams.set("location", filters.location);
  if (filters.status) url.searchParams.set("status", filters.status);
  if (filters.severity) url.searchParams.set("severity", filters.severity);
  if (filters.date_from) url.searchParams.set("date_from", filters.date_from);
  if (filters.date_to) url.searchParams.set("date_to", filters.date_to);
  if (filters.sort_by) url.searchParams.set("sort_by", filters.sort_by);
  if (filters.sort_order) url.searchParams.set("sort_order", filters.sort_order);
  if (filters.company_name) url.searchParams.set("company_name", filters.company_name);
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("報告一覧の取得に失敗しました");
  return res.json();
}

export async function getReport(id: number): Promise<Report> {
  const res = await fetch(`${API_BASE}/reports/${id}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("報告の取得に失敗しました");
  return res.json();
}

/**
 * 報告を新規作成する。FormData を使う理由：
 * JSON では画像・動画ファイルを本文に含められない。
 * multipart/form-data（FormData）ならテキストとファイルを同時に送れる。
 * Content-Type ヘッダーは fetch が自動で設定するため手動で指定しない
 * （手動で設定すると boundary が欠けて送信エラーになる）。
 */
export async function createReport(formData: FormData): Promise<Report> {
  const res = await fetch(`${API_BASE}/reports`, {
    method: "POST",
    headers: authHeaders(),  // Content-Type は fetch が自動設定
    body: formData,
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("報告の登録に失敗しました");
  return res.json();
}

export async function updateReport(id: number, formData: FormData): Promise<Report> {
  const res = await fetch(`${API_BASE}/reports/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: formData,
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("報告の更新に失敗しました");
  return res.json();
}

export async function updateReportStatus(id: number, status: Status): Promise<Report> {
  const res = await fetch(`${API_BASE}/reports/${id}`, {
    method: "PATCH",  // 一部フィールドのみ更新するので PUT ではなく PATCH を使う
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ status }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("ステータスの更新に失敗しました");
  return res.json();
}

export async function deleteReport(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/reports/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("削除に失敗しました");
}

/**
 * PDF をダウンロードさせる。
 * バックエンドからバイト列（blob）を受け取り、
 * 一時 URL を生成してアンカークリックを模擬することで
 * ブラウザのダウンロードダイアログを発生させる。
 * URL.revokeObjectURL で一時 URL を解放してメモリリークを防ぐ。
 */
export async function downloadPdf(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/reports/${id}/pdf`, {
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("PDFの取得に失敗しました");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report_${id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * サーバーに保存されたファイルの公開 URL を返す。
 * バックエンドは /files/<filename> でファイルを配信している（StaticFiles）。
 * file_path はサーバーの絶対パスなので、ファイル名だけ取り出して URL を組み立てる。
 * split(/[/\\]/) で Linux のスラッシュと Windows のバックスラッシュ両方に対応。
 */
export function getFileUrl(filePath: string): string {
  const filename = filePath.split(/[/\\]/).pop() ?? "";
  return `${API_BASE}/files/${filename}`;
}

export interface MessageSummary {
  report_id: number;
  latest_message_id: number;
  preview: string;
  sender_name: string;
  latest_at: string;
}

export async function getUnreadSummary(): Promise<MessageSummary[]> {
  const res = await fetch(`${API_BASE}/messages/unread-summary`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("未読サマリーの取得に失敗しました");
  return res.json();
}

export async function getMessages(reportId: number): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/reports/${reportId}/messages`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("メッセージの取得に失敗しました");
  return res.json();
}

export async function sendMessage(reportId: number, content: string): Promise<Message> {
  const res = await fetch(`${API_BASE}/reports/${reportId}/messages`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ content }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("メッセージの送信に失敗しました");
  return res.json();
}

// ── 統計 ─────────────────────────────────────────────────────────

export interface Stats {
  monthly: { month: string; count: number }[];
  by_severity: { high: number; medium: number; low: number };
  by_status: { open: number; in_progress: number; resolved: number };
  top_machines: { machine_name: string; count: number }[];
  recurring_machines: { machine_name: string; count: number }[];
}

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/reports/stats`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("統計の取得に失敗しました");
  return res.json();
}

// ── スタッフ一覧 ──────────────────────────────────────────────────

export interface StaffUser {
  id: number;
  username: string;
  role: string;
  email: string;
}

export async function getStaff(): Promise<StaffUser[]> {
  const res = await fetch(`${API_BASE}/auth/staff`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("スタッフ一覧の取得に失敗しました");
  return res.json();
}

export async function assignReport(reportId: number, assigneeId: number | null): Promise<Report> {
  const res = await fetch(`${API_BASE}/reports/${reportId}/assign`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ assignee_id: assigneeId }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("担当者の設定に失敗しました");
  return res.json();
}

export async function getRecurrence(reportId: number): Promise<{ count: number; machine_name: string }> {
  const res = await fetch(`${API_BASE}/reports/${reportId}/recurrence`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("再発情報の取得に失敗しました");
  return res.json();
}

// ── ステータス変更ログ ────────────────────────────────────────────

export interface StatusLog {
  id: number;
  report_id: number;
  user_id: number | null;
  changed_by: string;
  old_status: string;
  new_status: string;
  changed_at: string;
}

export async function getStatusLogs(reportId: number): Promise<StatusLog[]> {
  const res = await fetch(`${API_BASE}/reports/${reportId}/status-logs`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error("ステータスログの取得に失敗しました");
  return res.json();
}

// ── AI ヒアリング ────────────────────────────────────────────────

export interface InterviewMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InterviewResponse {
  content: string;
  complete: boolean;
  report_data?: {
    machine_name: string;
    location: string;
    description: string;
    severity: string;
  };
}

// ── 確認項目 ─────────────────────────────────────────────────────

export interface CheckItem {
  id: number;
  content: string;
  machine_name: string | null;  // null = 全機器共通
  order_index: number;
}

/**
 * 確認項目を取得する。
 * machine_name を指定すると「その機器の項目 + 共通項目（null）」が返る。
 * 省略すると全項目が返る（設定画面用）。
 *
 * ?? null の正規化について：
 * バックエンドが machine_name フィールドを JSON に含めない場合、
 * JavaScript は undefined を返す。undefined === null は false のため、
 * 「共通項目かどうか」の判定が壊れる。
 * ?? null で undefined を null に変換することで、
 * フロント側の == null（ゆるい等価）による判定を安全にしている。
 */
export async function getCheckItems(machine_name?: string): Promise<CheckItem[]> {
  const url = new URL(`${API_BASE}/check-items`);
  if (machine_name) url.searchParams.set("machine_name", machine_name);
  const res = await fetch(url.toString(), { cache: "no-store", headers: authHeaders() });
  if (!res.ok) return [];
  const data: CheckItem[] = await res.json();
  return data.map((item) => ({ ...item, machine_name: item.machine_name ?? null }));
}

export async function getCheckItemMachines(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/check-items/machines`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function createCheckItem(content: string, order_index: number, machine_name?: string): Promise<CheckItem> {
  const res = await fetch(`${API_BASE}/check-items`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ content, order_index, machine_name: machine_name || null }),
  });
  if (!res.ok) throw new Error("確認項目の作成に失敗しました");
  return res.json();
}

export async function updateCheckItem(id: number, content: string, order_index: number, machine_name?: string): Promise<CheckItem> {
  const res = await fetch(`${API_BASE}/check-items/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ content, order_index, machine_name: machine_name || null }),
  });
  if (!res.ok) throw new Error("確認項目の更新に失敗しました");
  return res.json();
}

export async function deleteCheckItem(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/check-items/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("確認項目の削除に失敗しました");
}

/**
 * content と machine_name の組み合わせが同じ重複項目を削除する。
 * DELETE メソッドに JSON レスポンスを返すのは RESTful の厳密な定義からは外れるが、
 * 「何件削除したか」をフロントに伝えるために使っている。
 */
export async function dedupCheckItems(): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/check-items/dedup`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("重複削除に失敗しました");
  return res.json();
}

export interface InterviewSuggestions {
  machine_names: string[];
  locations: string[];
}

/**
 * 過去の報告から使用頻度の高い機器名・場所を取得する。
 * 選択ウィザードの場所フェーズで候補チップとして表示する。
 */
export async function getInterviewSuggestions(): Promise<InterviewSuggestions> {
  const res = await fetch(`${API_BASE}/ai-interview/suggestions`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (!res.ok) return { machine_names: [], locations: [] };
  return res.json();
}

/**
 * Groq API（Llama 3.3 70B）への中継。
 * 現在の選択ウィザードでは使っていないが、
 * 将来の AI チャット復活や機能拡張に備えて残している。
 * 503 はサーバー側で GROQ_API_KEY が未設定の場合に返る。
 */
export async function sendInterviewMessage(
  messages: InterviewMessage[],
  check_context?: string,
): Promise<InterviewResponse> {
  const res = await fetch(`${API_BASE}/ai-interview`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ messages, check_context }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? "AI機能が利用できません");
  }
  if (!res.ok) throw new Error("AIとの通信に失敗しました");
  return res.json();
}

/**
 * API の URL（http://...）を WebSocket の URL（ws://...）に変換する。
 * WS 接続は fetch と異なり、スキームを明示的に ws:// / wss:// にする必要がある。
 */
export function getWsBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    .replace(/^http/, "ws");
}
