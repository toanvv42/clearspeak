import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/server/access";
import { listAttempts } from "@/lib/server/history-repository";

export const runtime = "nodejs";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: Request) {
  const auth = checkAccess(req);
  if (auth) return noStore(NextResponse.json(auth.body, { status: auth.status }));
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("q") ?? url.searchParams.get("search") ?? undefined;
    const filterParam = url.searchParams.get("filter") ?? "all";
    const filter =
      filterParam === "evaluated" || filterParam === "pending" || filterParam === "failed"
        ? filterParam
        : ("all" as const);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitRaw = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 20;
    const { items, nextCursor } = listAttempts({
      search: search?.slice(0, 200),
      filter,
      cursor: cursor?.slice(0, 500),
      limit,
    });
    return noStore(NextResponse.json({ items, nextCursor }));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "storage-unavailable")
      return noStore(NextResponse.json({ error: "Storage unavailable.", code }, { status: 503 }));
    return noStore(NextResponse.json({ error: "Could not load history.", code: "load_failed" }, { status: 500 }));
  }
}
