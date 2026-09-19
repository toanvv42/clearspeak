import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/server/access";
import {
  getAllTargetStats,
  getDueReviews,
  getWeeklyCounts,
  listFavourites,
} from "@/lib/server/history-repository";
import { getDb } from "@/lib/server/history-db";

export const runtime = "nodejs";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: Request) {
  const auth = checkAccess(req);
  if (auth) return noStore(NextResponse.json(auth.body, { status: auth.status }));
  try {
    const db = getDb();
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM attempts`).get() as { n: number }
    ).n;
    const days = (
      db.prepare(`SELECT COUNT(DISTINCT substr(recorded_at, 1, 10)) AS n FROM attempts`).get() as {
        n: number;
      }
    ).n;
    const due = getDueReviews();
    const weekly = getWeeklyCounts(7);
    const favourites = listFavourites();
    const stats = getAllTargetStats();
    return noStore(
      NextResponse.json({
        totals: { attempts: Number(total), practiceDays: Number(days) },
        due,
        weekly,
        favourites,
        stats,
      }),
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "storage-unavailable")
      return noStore(NextResponse.json({ error: "Storage unavailable.", code }, { status: 503 }));
    return noStore(NextResponse.json({ error: "Could not load progress.", code: "load_failed" }, { status: 500 }));
  }
}
