#!/usr/bin/env node

/**
 * Downloads person thumbnail images from jmail.world
 * and saves them to public/people-thumbnails/
 * 
 * Handles 404s gracefully and continues on errors.
 */

import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import postgres from "postgres";

const JMAIL_DB_URL =
  process.env.JMAIL_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/jmail";

const OUTPUT_DIR = path.resolve("public/people-thumbnails");
const BASE_URL = "https://jmail.world/people-thumbnails";

async function downloadOne(personId, name) {
  const filename = `${personId}.png`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  // Skip if already downloaded
  if (existsSync(outputPath)) {
    return "skipped";
  }

  const url = `${BASE_URL}/${filename}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; InvestigationSimulator/1.0)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return "notfound";
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return "notfound";
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) {
      return "notfound";
    }

    await writeFile(outputPath, buffer);
    console.log(`  ✓ ${name} (${(buffer.length / 1024).toFixed(1)}KB)`);
    return "downloaded";
  } catch (err) {
    // Silently ignore network errors
    return "error";
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Created ${OUTPUT_DIR}`);
  }

  // Connect to jmail DB and get all person IDs
  const sql = postgres(JMAIL_DB_URL);
  let rows;
  try {
    rows = await sql`
      SELECT id, name FROM people ORDER BY (raw_json->>'photo_count')::int DESC NULLS LAST
    `;
  } catch (err) {
    console.error("DB connection error:", err.message);
    process.exit(1);
  }

  console.log(`Found ${rows.length} people in database`);
  await sql.end();

  let downloaded = 0;
  let skipped = 0;
  let notfound = 0;
  let errors = 0;

  // Process one at a time with delay to avoid rate limiting
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const result = await downloadOne(row.id, row.name);
    
    switch (result) {
      case "downloaded": downloaded++; break;
      case "skipped": skipped++; break;
      case "notfound": notfound++; break;
      case "error": errors++; break;
    }

    // Show progress every 20 items
    if ((i + 1) % 20 === 0 || i === rows.length - 1) {
      console.log(`  [${i + 1}/${rows.length}] ${downloaded} downloaded, ${skipped} skipped, ${notfound} missing, ${errors} errors`);
    }

    // Small delay to be polite to the server
    if (result === "downloaded") {
      await sleep(100);
    }
  }

  console.log(`\nDone!`);
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Already existed: ${skipped}`);
  console.log(`  Not available: ${notfound}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total with local thumbnails: ${downloaded + skipped}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
