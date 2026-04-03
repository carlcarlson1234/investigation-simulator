import { NextRequest, NextResponse } from "next/server";
import { browseFiles } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Number(searchParams.get("page") ?? 1);
  const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 30), 60);

  try {
    const result = await browseFiles({ page, pageSize });
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("Files API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch files", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
