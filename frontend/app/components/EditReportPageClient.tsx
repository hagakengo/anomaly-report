"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { getReport, Report } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import EditReportForm from "./EditReportForm";

export default function EditReportPageClient({ id }: { id: number }) {
  const { logout } = useAuth();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);

  useEffect(() => {
    getReport(id)
      .then(setReport)
      .catch((e) => {
        if (e instanceof Error && e.message === "UNAUTHORIZED") {
          logout();
          router.push("/login");
        } else {
          setNotFoundFlag(true);
        }
      })
      .finally(() => setLoading(false));
  }, [id, logout, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
        読み込み中...
      </div>
    );
  }

  if (notFoundFlag || !report) {
    notFound();
  }

  return <EditReportForm report={report} />;
}
