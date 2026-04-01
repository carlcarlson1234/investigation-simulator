import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/clip
 * Fetches a URL and returns title, description, and content preview.
 * Body: { url: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Fetch the page
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; InvestigationSimulator/1.0)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${res.status}` },
        { status: 502 }
      );
    }

    const html = await res.text();

    // Extract metadata from HTML
    const title =
      extractMeta(html, "og:title") ||
      extractTag(html, "title") ||
      parsed.hostname;

    const description =
      extractMeta(html, "og:description") ||
      extractMeta(html, "description") ||
      "";

    const image = extractMeta(html, "og:image") || "";

    // Extract text content (strip tags, take first 2000 chars)
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    return NextResponse.json({
      url: parsed.toString(),
      title,
      description,
      image,
      textContent,
      domain: parsed.hostname,
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out" }, { status: 504 });
    }
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}

function extractMeta(html: string, name: string): string {
  // Try property="name" and name="name"
  const propMatch = html.match(
    new RegExp(
      `<meta[^>]*(?:property|name)=["'](?:og:)?${name}["'][^>]*content=["']([^"']*)["']`,
      "i"
    )
  );
  if (propMatch) return propMatch[1];

  // Try content before property
  const altMatch = html.match(
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["'](?:og:)?${name}["']`,
      "i"
    )
  );
  if (altMatch) return altMatch[1];

  return "";
}

function extractTag(html: string, tag: string): string {
  const match = html.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return match ? match[1].trim() : "";
}
