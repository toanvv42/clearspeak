import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/server/access";
import { isUuid } from "@/lib/history/types";
import { validateEvaluationPayload } from "@/lib/history/validation";
import { saveEvaluation } from "@/lib/server/history-repository";

export const runtime = "nodejs";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAccess(req);
  if (auth) return noStore(NextResponse.json(auth.body, { status: auth.status }));
  const { id } = await ctx.params;
  if (!isUuid(id)) return noStore(NextResponse.json({ error: "Invalid id.", code: "invalid" }, { status: 400 }));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid evaluation.", code: "invalid" }, { status: 400 }));
  }
  let payload;
  try {
    payload = validateEvaluationPayload(body);
  } catch {
    return noStore(NextResponse.json({ error: "Invalid evaluation.", code: "invalid" }, { status: 400 }));
  }
  try {
    const item = saveEvaluation(id, payload);
    return noStore(NextResponse.json({ item }));
  } catch (err) {
    const code = (err as { code?: string }).code ?? (err as Error).message;
    if (code === "deleted")
      return noStore(NextResponse.json({ error: "This recording was deleted.", code: "deleted" }, { status: 410 }));
    if (code === "invalid")
      return noStore(
        NextResponse.json({ error: "Evaluation does not match this recording.", code: "invalid" }, { status: 400 }),
      );
    if (code === "not-found")
      return noStore(NextResponse.json({ error: "Recording not found.", code: "not_found" }, { status: 404 }));
    if (code === "conflict")
      return noStore(
        NextResponse.json({ error: "Conflicting evaluation write.", code: "conflict" }, { status: 409 }),
      );
    if (code === "busy")
      return noStore(NextResponse.json({ error: "Database is busy. Try again.", code: "busy" }, { status: 503 }));
    const msg = (err as Error).message ?? "";
    if (msg.startsWith("storage-unavailable") || msg.startsWith("CLEARSPEAK_DATA_DIR"))
      return noStore(NextResponse.json({ error: "Storage unavailable.", code: "storage_unavailable" }, { status: 503 }));
    return noStore(NextResponse.json({ error: "Could not save evaluation.", code: "save_failed" }, { status: 500 }));
  }
}
