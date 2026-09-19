import ProgressApp from "@/components/progress-app";

export const dynamic = "force-dynamic";

export default function Page() {
  const accessRequired = Boolean(process.env.APP_ACCESS_CODE);
  return <ProgressApp accessRequired={accessRequired} />;
}
