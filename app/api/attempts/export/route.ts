import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/server/access";
import { exportHistory } from "@/lib/server/history-repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = checkAccess(req);
  if (auth) {
    const res = NextResponse.json(auth.body, { status: auth.status });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "500");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, Math.floor(limitRaw))) : 500;
    const data = exportHistory(limit);
    const res = NextResponse.json(data);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set(
      "Content-Disposition",
      `attachment; filename="clearspeak-history-${data.exportedAt.slice(0, 10)}.json"`,
    );
    return res;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "storage-unavailable") {
      const res = NextResponse.json({ error: "Storage unavailable.", code }, { status: 503 });
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    const res = NextResponse.json({ error: "Could not export history.", code: "export_failed" }, { status: 500 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
}
