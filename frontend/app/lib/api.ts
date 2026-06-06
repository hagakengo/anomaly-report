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
}

export interface Message {
  id: number;
  report_id: number;
  sender_id: number;
  sender_name: string;
  content: string;
  created_at: string;
}

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

function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

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

export async function createReport(formData: FormData): Promise<Report> {
  const res = await fetch(`${API_BASE}/reports`, {
    method: "POST",
    headers: authHeaders(),
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
    method: "PATCH",
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

export async function sendInterviewMessage(
  messages: InterviewMessage[],
): Promise<InterviewResponse> {
  const res = await fetch(`${API_BASE}/ai-interview`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ messages }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? "AI機能が利用できません");
  }
  if (!res.ok) throw new Error("AIとの通信に失敗しました");
  return res.json();
}

export function getWsBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    .replace(/^http/, "ws");
}
