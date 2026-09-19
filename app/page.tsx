import ClearSpeakApp from "@/components/clearspeak-app";

// The access gate reflects the runtime environment. This avoids baking a stale
// value into a static build when deployment secrets change between releases.
export const dynamic = "force-dynamic";

export default function Page() {
  // Server-only: never pass the configured code to the client, only whether a gate is needed.
  const accessRequired = Boolean(process.env.APP_ACCESS_CODE);
  return <ClearSpeakApp accessRequired={accessRequired} />;
}
