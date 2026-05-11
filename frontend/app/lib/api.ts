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
}

export interface ReportFilters {
  machine_name?: string;
  location?: string;
  status?: string;
}

export async function getReports(filters: ReportFilters = {}): Promise<Report[]> {
  const url = new URL(`${API_BASE}/reports`);
  if (filters.machine_name) url.searchParams.set("machine_name", filters.machine_name);
  if (filters.location) url.searchParams.set("location", filters.location);
  if (filters.status) url.searchParams.set("status", filters.status);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("報告一覧の取得に失敗しました");
  return res.json();
}

export async function createReport(formData: FormData): Promise<Report> {
  const res = await fetch(`${API_BASE}/reports`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("報告の登録に失敗しました");
  return res.json();
}

export async function updateReportStatus(id: number, status: Status): Promise<Report> {
  const res = await fetch(`${API_BASE}/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("ステータスの更新に失敗しました");
  return res.json();
}

export async function deleteReport(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/reports/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("削除に失敗しました");
}

export function getPdfUrl(id: number): string {
  return `${API_BASE}/reports/${id}/pdf`;
}

export function getFileUrl(filePath: string): string {
  const filename = filePath.split(/[/\\]/).pop() ?? "";
  return `${API_BASE}/files/${filename}`;
}
