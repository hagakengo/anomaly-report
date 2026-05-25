import EditReportPageClient from "../../../components/EditReportPageClient";

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditReportPageClient id={Number(id)} />;
}
