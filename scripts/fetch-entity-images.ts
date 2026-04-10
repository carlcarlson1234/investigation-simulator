#!/usr/bin/env tsx
/**
 * scripts/fetch-entity-images.ts
 *
 * One-off script to download entity images from Wikipedia/Wikimedia Commons.
 * Caches files to public/entity-images/{entity_id}.jpg.
 * Idempotent — skips entities whose image already exists.
 *
 * Usage:  npm run seed:entity-images
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { SEED_ENTITIES } from "../src/lib/entity-seed-data";

const OUT_DIR = join(__dirname, "..", "public", "entity-images");
const USER_AGENT = "OpenCase/1.0 (https://opencase.app; admin@opencase.app)";
const RATE_LIMIT_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchImageUrl(entity: (typeof SEED_ENTITIES)[number]): Promise<string | null> {
  const { image } = entity;

  if (image.strategy === "none") return null;

  if (image.strategy === "wikipedia") {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(image.article)}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      console.error(`  [WARN] Wikipedia API returned ${res.status} for article "${image.article}"`);
      return null;
    }
    const data = await res.json();
    // Prefer originalimage, fall back to thumbnail
    return data.originalimage?.source || data.thumbnail?.source || null;
  }

  if (image.strategy === "wikimedia_file") {
    // Direct download via Special:FilePath with width cap
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image.file)}?width=800`;
  }

  return null;
}

async function downloadImage(url: string, outPath: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    if (!res.ok) {
      console.error(`  [WARN] HTTP ${res.status} downloading ${url}`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(outPath, buffer);
    return true;
  } catch (err) {
    console.error(`  [WARN] Failed to download ${url}:`, (err as Error).message);
    return false;
  }
}

async function main() {
  console.log("=== Fetching entity images ===\n");

  // Ensure output directory exists
  mkdirSync(OUT_DIR, { recursive: true });

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  let noImage = 0;

  for (const entity of SEED_ENTITIES) {
    const outPath = join(OUT_DIR, `${entity.id}.jpg`);

    // Skip if already cached
    if (existsSync(outPath)) {
      skipped++;
      continue;
    }

    if (entity.image.strategy === "none") {
      noImage++;
      continue;
    }

    console.log(`[${entity.id}] ${entity.name}`);

    const imageUrl = await fetchImageUrl(entity);
    if (!imageUrl) {
      console.error(`  [SKIP] No image URL resolved`);
      failed++;
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    console.log(`  Downloading: ${imageUrl.substring(0, 80)}...`);
    const ok = await downloadImage(imageUrl, outPath);
    if (ok) {
      console.log(`  Saved: ${outPath}`);
      fetched++;
    } else {
      failed++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\n=== Done ===`);
  console.log(`  Fetched: ${fetched}`);
  console.log(`  Skipped (cached): ${skipped}`);
  console.log(`  No image: ${noImage}`);
  console.log(`  Failed: ${failed}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
