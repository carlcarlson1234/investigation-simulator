import { NextRequest, NextResponse } from "next/server";
import { browseEmails } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") ?? 30)));
  const sort = sp.get("sort") === "oldest" ? "oldest" : "newest";
  const search = sp.get("q") ?? undefined;
  const sender = sp.get("sender") ?? undefined;
  const epsteinOnly = sp.get("epsteinOnly") === "true";

  try {
    const result = await browseEmails({
      page,
      pageSize,
      sort: sort as "newest" | "oldest",
      search,
      sender,
      epsteinOnly,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Email browse error:", err);
    return NextResponse.json(
      { error: "Failed to browse emails" },
      { status: 500 }
    );
  }
}
