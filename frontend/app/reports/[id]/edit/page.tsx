import { notFound } from "next/navigation";
import EditReportForm from "../../../components/EditReportForm";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function getReport(id: string) {
  const res = await fetch(`${API_BASE}/reports`, { cache: "no-store" });
  if (!res.ok) return null;
  const reports = await res.json();
  return reports.find((r: { id: number }) => r.id === Number(id)) ?? null;
}

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();
  return <EditReportForm report={report} />;
}
