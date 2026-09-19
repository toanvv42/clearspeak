import HistoryDetailApp from "@/components/history-detail-app";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accessRequired = Boolean(process.env.APP_ACCESS_CODE);
  return <HistoryDetailApp id={id} accessRequired={accessRequired} />;
}
