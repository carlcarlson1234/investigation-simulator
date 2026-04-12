// Seed the jmail DB with JeffTube video records.
// Source: https://jmail.world/api/jefftube/videos — a Next.js route returning
// a JSON array of 1,102 videos.
//
// Idempotent: creates the table if needed, upserts rows by id, rebuilds
// search_vector.
//
// Run with: node scripts/seed-videos.mjs

import postgres from "postgres";
import fs from "node:fs";

function loadEnv(path) {
  try {
    const txt = fs.readFileSync(path, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    /* ignore */
  }
}
loadEnv(".env.local");

const url = process.env.JMAIL_DATABASE_URL;
if (!url) {
  console.error("JMAIL_DATABASE_URL not set in .env.local");
  process.exit(1);
}

const UPSTREAM = "https://jmail.world/api/jefftube/videos";

function log(s) {
  console.log(`[seed-videos] ${s}`);
}

async function fetchVideos() {
  log(`downloading ${UPSTREAM}`);
  const res = await fetch(UPSTREAM, {
    signal: AbortSignal.timeout(30000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("upstream did not return an array");
  log(`fetched ${rows.length} videos`);
  return rows;
}

function nullStr(x) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s === "" ? null : s;
}

function nullInt(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function nullBool(x) {
  if (typeof x === "boolean") return x;
  if (x === null || x === undefined) return null;
  return Boolean(x);
}

const sql = postgres(url, { max: 4, idle_timeout: 10 });

try {
  const rows = await fetchVideos();

  log("creating table + indexes if needed");
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS videos (
      id               text PRIMARY KEY,
      title            text,
      filename         text,
      length_sec       int,
      views            int,
      likes            int,
      has_thumbnail    boolean,
      is_shorts        boolean,
      is_nsfw          boolean,
      data_set         int,
      playlist         jsonb,
      comment_count    int,
      raw_json         jsonb,
      search_vector    tsvector,
      ingested_at      timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS videos_search_idx     ON videos USING GIN(search_vector);
    CREATE INDEX IF NOT EXISTS videos_views_idx      ON videos(views DESC NULLS LAST);
    CREATE INDEX IF NOT EXISTS videos_is_shorts_idx  ON videos(is_shorts);
    CREATE INDEX IF NOT EXISTS videos_is_nsfw_idx    ON videos(is_nsfw);
  `);

  log(`upserting ${rows.length} rows in chunks of 200`);
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({
      id: String(r.id ?? ""),
      // Upstream often sets title === filename when there's no real title.
      // Normalize: null out the title in that case so search/display can use
      // a cleaner fallback.
      title:
        nullStr(r.title) && r.title !== r.filename ? nullStr(r.title) : null,
      filename: nullStr(r.filename),
      length_sec: nullInt(r.length),
      views: nullInt(r.views) ?? 0,
      likes: nullInt(r.likes) ?? 0,
      has_thumbnail: nullBool(r.hasThumbnail) ?? false,
      is_shorts: nullBool(r.is_shorts) ?? false,
      is_nsfw: nullBool(r.is_nsfw) ?? false,
      data_set: nullInt(r.data_set),
      playlist: sql.json(r.playlist ?? null),
      comment_count: nullInt(r.commentCount) ?? 0,
      raw_json: sql.json(r),
    }));

    await sql`
      INSERT INTO videos ${sql(
        chunk,
        "id",
        "title",
        "filename",
        "length_sec",
        "views",
        "likes",
        "has_thumbnail",
        "is_shorts",
        "is_nsfw",
        "data_set",
        "playlist",
        "comment_count",
        "raw_json",
      )}
      ON CONFLICT (id) DO UPDATE SET
        title         = EXCLUDED.title,
        filename      = EXCLUDED.filename,
        length_sec    = EXCLUDED.length_sec,
        views         = EXCLUDED.views,
        likes         = EXCLUDED.likes,
        has_thumbnail = EXCLUDED.has_thumbnail,
        is_shorts     = EXCLUDED.is_shorts,
        is_nsfw       = EXCLUDED.is_nsfw,
        data_set      = EXCLUDED.data_set,
        playlist      = EXCLUDED.playlist,
        comment_count = EXCLUDED.comment_count,
        raw_json      = EXCLUDED.raw_json
    `;
    inserted += chunk.length;
    if (inserted % 400 === 0 || inserted === rows.length) {
      log(`  ${inserted}/${rows.length}`);
    }
  }

  log("rebuilding search_vector");
  await sql.unsafe(`
    UPDATE videos SET search_vector = to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(filename, '')
    )
  `);

  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM videos`;
  log(`videos table row count: ${n}`);

  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_shorts)::int AS shorts,
      COUNT(*) FILTER (WHERE is_nsfw)::int AS nsfw,
      COUNT(*) FILTER (WHERE title IS NOT NULL)::int AS named,
      SUM(views)::bigint AS total_views
    FROM videos
  `;
  log(
    `stats: ${stats.total} total, ${stats.shorts} shorts, ${stats.nsfw} nsfw, ${stats.named} with real titles, ${stats.total_views.toLocaleString()} total views`,
  );

  const topViewed = await sql`
    SELECT id, coalesce(title, filename) AS label, views
    FROM videos
    ORDER BY views DESC NULLS LAST
    LIMIT 5
  `;
  log("top-viewed:");
  for (const r of topViewed) {
    log(`  ${r.views.toLocaleString().padStart(10)}  ${r.label}`);
  }

  log(`done — inserted ${inserted} videos`);
} catch (err) {
  console.error("\nSEED FAILED:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
} finally {
  await sql.end();
}
