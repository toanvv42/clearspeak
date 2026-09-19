import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/server/access";
import {
  createAttempt,
  deleteAttempt,
  getAttemptDetail,
} from "@/lib/server/history-repository";
import { isUuid } from "@/lib/history/types";
import { validateAttemptCreate } from "@/lib/history/validation";
import { MAX_WAV_BYTES, validateWavBytes } from "@/lib/server/wav-validate";

export const runtime = "nodejs";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function errToStatus(err: unknown): { status: number; body: unknown } {
  const code = (err as { code?: string }).code;
  const message = (err as Error).message ?? "";
  if (code === "deleted" || message === "deleted")
    return { status: 410, body: { error: "This recording was deleted.", code: "deleted" } };
  if (code === "conflict" || message === "conflict")
    return { status: 409, body: { error: "Conflicting write for this recording.", code: "conflict" } };
  if (code === "not-found" || message === "not-found")
    return { status: 404, body: { error: "Recording not found.", code: "not_found" } };
  if (code === "busy" || message === "busy")
    return { status: 503, body: { error: "Database is busy. Try again.", code: "busy" } };
  if (code === "storage-unavailable" || message.startsWith("storage-unavailable"))
    return { status: 503, body: { error: "Storage unavailable.", code: "storage_unavailable" } };
  if (message.startsWith("CLEARSPEAK_DATA_DIR"))
    return { status: 503, body: { error: "Storage unavailable.", code: "storage_unavailable" } };
  return { status: 400, body: { error: "Invalid recording upload.", code: "invalid" } };
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAccess(req);
  if (auth) return noStore(NextResponse.json(auth.body, { status: auth.status }));
  const { id } = await ctx.params;
  if (!isUuid(id)) return noStore(NextResponse.json({ error: "Invalid id.", code: "invalid" }, { status: 400 }));
  // Early gate: formData() buffers the full multipart body, so reject
  // over-limit requests on Content-Length before parsing. Chunked requests
  // without a length still hit the byte checks below after buffering.
  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WAV_BYTES + 16 * 1024) {
    return noStore(NextResponse.json({ error: "Recording too large.", code: "oversize" }, { status: 413 }));
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid upload.", code: "invalid" }, { status: 400 }));
  }
  const metaRaw = form.get("metadata");
  const wavFile = form.get("wav");
  if (typeof metaRaw !== "string" || !(wavFile instanceof Blob)) {
    return noStore(NextResponse.json({ error: "Upload needs metadata and wav.", code: "invalid" }, { status: 400 }));
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(metaRaw);
  } catch {
    return noStore(NextResponse.json({ error: "Invalid metadata.", code: "invalid" }, { status: 400 }));
  }
  let payload;
  try {
    payload = validateAttemptCreate(metadata);
  } catch {
    return noStore(NextResponse.json({ error: "Invalid metadata.", code: "invalid" }, { status: 400 }));
  }
  if (wavFile.size > MAX_WAV_BYTES) {
    return noStore(NextResponse.json({ error: "Recording too large.", code: "oversize" }, { status: 413 }));
  }
  let wavBytes: Buffer;
  try {
    wavBytes = Buffer.from(await (wavFile as Blob).arrayBuffer());
  } catch {
    return noStore(NextResponse.json({ error: "Could not read audio.", code: "invalid" }, { status: 400 }));
  }
  if (wavBytes.length > MAX_WAV_BYTES) {
    return noStore(NextResponse.json({ error: "Recording too large.", code: "oversize" }, { status: 413 }));
  }
  let wav;
  try {
    wav = validateWavBytes(wavBytes, payload.durationMs);
  } catch (err) {
    const msg = (err as Error).message ?? "invalid";
    if (msg.startsWith("oversize")) {
      return noStore(NextResponse.json({ error: "Recording too large.", code: "oversize" }, { status: 413 }));
    }
    return noStore(
      NextResponse.json({ error: "Invalid audio file.", code: "invalid_audio" }, { status: 400 }),
    );
  }
  try {
    const { summary, created } = createAttempt({ id, ...payload, wav });
    return noStore(NextResponse.json({ item: summary, created }, { status: created ? 201 : 200 }));
  } catch (err) {
    const mapped = errToStatus(err);
    return noStore(NextResponse.json(mapped.body, { status: mapped.status }));
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAccess(req);
  if (auth) return noStore(NextResponse.json(auth.body, { status: auth.status }));
  const { id } = await ctx.params;
  if (!isUuid(id)) return noStore(NextResponse.json({ error: "Invalid id.", code: "invalid" }, { status: 400 }));
  try {
    const detail = getAttemptDetail(id);
    if (!detail) return noStore(NextResponse.json({ error: "Recording not found.", code: "not_found" }, { status: 404 }));
    return noStore(NextResponse.json({ item: detail }));
  } catch (err) {
    const mapped = errToStatus(err);
    return noStore(NextResponse.json(mapped.body, { status: mapped.status }));
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAccess(req);
  if (auth) return noStore(NextResponse.json(auth.body, { status: auth.status }));
  const { id } = await ctx.params;
  if (!isUuid(id)) return noStore(NextResponse.json({ error: "Invalid id.", code: "invalid" }, { status: 400 }));
  try {
    deleteAttempt(id);
    return noStore(NextResponse.json({ ok: true }));
  } catch (err) {
    const mapped = errToStatus(err);
    return noStore(NextResponse.json(mapped.body, { status: mapped.status }));
  }
}
