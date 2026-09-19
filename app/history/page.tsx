import HistoryApp from "@/components/history-app";

export const dynamic = "force-dynamic";

export default function Page() {
  const accessRequired = Boolean(process.env.APP_ACCESS_CODE);
  return <HistoryApp accessRequired={accessRequired} />;
}
