import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/server/access";
import {
  addFavourite,
  listFavourites,
  removeFavourite,
} from "@/lib/server/history-repository";
import { getPassageById } from "@/lib/practice-content";

export const runtime = "nodejs";

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: Request) {
  const auth = checkAccess(req);
  if (auth) return noStore(NextResponse.json(auth.body, { status: auth.status }));
  try {
    return noStore(NextResponse.json({ items: listFavourites() }));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "storage-unavailable")
      return noStore(NextResponse.json({ error: "Storage unavailable.", code }, { status: 503 }));
    return noStore(NextResponse.json({ error: "Could not load favourites.", code: "load_failed" }, { status: 500 }));
  }
}

export async function PUT(req: Request) {
  const auth = checkAccess(req);
  if (auth) return noStore(NextResponse.json(auth.body, { status: auth.status }));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStore(NextResponse.json({ error: "Invalid favourite.", code: "invalid" }, { status: 400 }));
  }
  const { passageId, passageVersion } = (body ?? {}) as {
    passageId?: unknown;
    passageVersion?: unknown;
  };
  if (typeof passageId !== "string" || passageId.length === 0 || passageId.length > 120) {
    return noStore(NextResponse.json({ error: "Invalid passage id.", code: "invalid" }, { status: 400 }));
  }
  if (!Number.isInteger(passageVersion) || (passageVersion as number) < 0) {
    return noStore(NextResponse.json({ error: "Invalid passage version.", code: "invalid" }, { status: 400 }));
  }
  // Only real library passages can be favourited: the identity must resolve.
  const passage = getPassageById(passageId, passageVersion as number);
  if (!passage) {
    return noStore(NextResponse.json({ error: "Unknown passage.", code: "not_found" }, { status: 404 }));
  }
  try {
    const item = addFavourite(passage.id, passage.version, passage.title);
    return noStore(NextResponse.json({ item }));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "storage-unavailable")
      return noStore(NextResponse.json({ error: "Storage unavailable.", code }, { status: 503 }));
    return noStore(NextResponse.json({ error: "Could not save favourite.", code: "save_failed" }, { status: 500 }));
  }
}

export async function DELETE(req: Request) {
  const auth = checkAccess(req);
  if (auth) return noStore(NextResponse.json(auth.body, { status: auth.status }));
  const url = new URL(req.url);
  const targetKey = url.searchParams.get("target") ?? "";
  if (!targetKey || targetKey.length > 200) {
    return noStore(NextResponse.json({ error: "Invalid favourite.", code: "invalid" }, { status: 400 }));
  }
  try {
    const removed = removeFavourite(targetKey);
    if (!removed) {
      return noStore(NextResponse.json({ error: "Favourite not found.", code: "not_found" }, { status: 404 }));
    }
    return noStore(NextResponse.json({ ok: true }));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "storage-unavailable")
      return noStore(NextResponse.json({ error: "Storage unavailable.", code }, { status: 503 }));
    return noStore(NextResponse.json({ error: "Could not delete favourite.", code: "delete_failed" }, { status: 500 }));
  }
}
