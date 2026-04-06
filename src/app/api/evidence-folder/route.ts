import { NextRequest, NextResponse } from "next/server";
import {
  getDirectEvidence,
  getCrypticEvidence,
  getFodderEvidence,
  photoThumbnailUrl,
} from "@/lib/queries";
import type { EvidenceFolderItem, EvidenceFolderCategory } from "@/lib/types";

const FOLDER_SIZE = 7;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const personIds: string[] = body.personIds ?? [];
    const excludeIds: string[] = body.excludeIds ?? [];

    const hasPeople = personIds.length > 0;

    // Adjust quotas based on whether people are on board
    const directLimit = hasPeople ? 3 : 0;
    const crypticLimit = hasPeople ? 2 : 4;
    const fodderLimit = hasPeople ? 2 : 3;

    // Fetch all categories in parallel
    const [direct, cryptic, fodder] = await Promise.all([
      directLimit > 0 ? getDirectEvidence(personIds, excludeIds, directLimit) : Promise.resolve([]),
      getCrypticEvidence(personIds, excludeIds, crypticLimit),
      getFodderEvidence(excludeIds, fodderLimit),
    ]);

    // Tag each item with its category and add thumbnail for photos
    const tagItems = (items: typeof direct, category: EvidenceFolderCategory): EvidenceFolderItem[] =>
      items.map((item) => ({
        ...item,
        folderCategory: category,
        thumbnailUrl: item.type === "photo" ? photoThumbnailUrl(item.id) : null,
      }));

    const allItems = [
      ...tagItems(direct, "direct"),
      ...tagItems(cryptic, "cryptic"),
      ...tagItems(fodder, "fodder"),
    ];

    // Shuffle so categories aren't grouped
    const items = shuffle(allItems).slice(0, FOLDER_SIZE);

    return NextResponse.json({ items });
  } catch (err: unknown) {
    console.error("Evidence folder error:", err);
    return NextResponse.json(
      { error: "Failed to generate evidence folder", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
