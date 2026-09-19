import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/server/access";
import { isUuid } from "@/lib/history/types";
import { getAttemptAudio } from "@/lib/server/history-repository";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkAccess(req);
  if (auth) {
    const r = NextResponse.json(auth.body, { status: auth.status });
    r.headers.set("Cache-Control", "no-store");
    return r;
  }
  const { id } = await ctx.params;
  if (!isUuid(id)) {
    const r = NextResponse.json({ error: "Invalid id.", code: "invalid" }, { status: 400 });
    r.headers.set("Cache-Control", "no-store");
    return r;
  }
  try {
    const audio = getAttemptAudio(id);
    if (!audio) {
      const r = NextResponse.json({ error: "Audio not found.", code: "not_found" }, { status: 404 });
      r.headers.set("Cache-Control", "no-store");
      return r;
    }
    const body = new Uint8Array(audio.bytes).buffer as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    const r = NextResponse.json({ error: "Could not load audio.", code: "load_failed" }, { status: 500 });
    r.headers.set("Cache-Control", "no-store");
    return r;
  }
}
