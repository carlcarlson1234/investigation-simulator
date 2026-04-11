// Seed the jmail DB with flight log records from data.jmail.world.
// Idempotent: creates the table if needed, upserts rows by id, rebuilds search_vector.
//
// Run with: node scripts/seed-flights.mjs
//
// Reads JMAIL_DATABASE_URL from .env.local.

import postgres from "postgres";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";

// Manual .env.local parse — avoids a dotenv dep in this one-off script.
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

const UPSTREAM = "https://data.jmail.world/v1/flights.ndjson.gz";

function log(s) {
  console.log(`[seed-flights] ${s}`);
}

async function fetchFlights() {
  log(`downloading ${UPSTREAM}`);
  const res = await fetch(UPSTREAM, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  log(`decompressing ${(gz.length / 1024).toFixed(0)}KB`);
  const ndjson = gunzipSync(gz).toString("utf8");
  const rows = [];
  for (const line of ndjson.split("\n")) {
    if (!line) continue;
    rows.push(JSON.parse(line));
  }
  log(`parsed ${rows.length} flights`);
  return rows;
}

function normalizePassengers(p) {
  // The NDJSON encodes passengers as a JSON-string array, e.g. "[\"Foo\",\"Bar\"]"
  if (!p) return [];
  if (Array.isArray(p)) return p;
  if (typeof p === "string") {
    try {
      const parsed = JSON.parse(p);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function nullDate(s) {
  // Upstream has both badly-formatted garbage ("07/1") AND well-formatted
  // strings with invalid components ("2005-19-05"). Reject both.
  if (typeof s !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dt.getTime())) return null;
  // Round-trip check: rejects things like 2004-03-43 that Date silently fixes
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

function nullInt(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function nullFloat(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function nullStr(x) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s === "" ? null : s;
}

const sql = postgres(url, { max: 4, idle_timeout: 10 });

try {
  const rows = await fetchFlights();

  log("creating table + indexes if needed");
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS flights (
      id                 text PRIMARY KEY,
      date               date,
      source_doc         text,
      departure          text,
      arrival            text,
      departure_code     text,
      departure_name     text,
      departure_city     text,
      departure_country  text,
      departure_lat      double precision,
      departure_lon      double precision,
      arrival_code       text,
      arrival_name       text,
      arrival_city       text,
      arrival_country    text,
      arrival_lat        double precision,
      arrival_lon        double precision,
      passengers         jsonb,
      passenger_count    int,
      aircraft           text,
      pilot              text,
      flight_number      text,
      notes              text,
      distance_nm        double precision,
      duration_minutes   int,
      raw_json           jsonb,
      search_vector      tsvector,
      ingested_at        timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS flights_search_idx ON flights USING GIN(search_vector);
    CREATE INDEX IF NOT EXISTS flights_date_idx   ON flights(date);
    CREATE INDEX IF NOT EXISTS flights_dep_code_idx ON flights(departure_code);
    CREATE INDEX IF NOT EXISTS flights_arr_code_idx ON flights(arrival_code);
  `);

  log("upserting rows in chunks of 200");
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({
      id: r.id,
      date: nullDate(r.date),
      source_doc: nullStr(r.source_doc),
      departure: nullStr(r.departure),
      arrival: nullStr(r.arrival),
      departure_code: nullStr(r.departure_code),
      departure_name: nullStr(r.departure_name),
      departure_city: nullStr(r.departure_city),
      departure_country: nullStr(r.departure_country),
      departure_lat: nullFloat(r.departure_lat),
      departure_lon: nullFloat(r.departure_lon),
      arrival_code: nullStr(r.arrival_code),
      arrival_name: nullStr(r.arrival_name),
      arrival_city: nullStr(r.arrival_city),
      arrival_country: nullStr(r.arrival_country),
      arrival_lat: nullFloat(r.arrival_lat),
      arrival_lon: nullFloat(r.arrival_lon),
      // Pass JS array directly — postgres.js serializes arrays into jsonb as
      // a JSON array. JSON.stringify'ing first would store it as a JSON
      // STRING scalar (jsonb_typeof='string') which breaks
      // jsonb_array_elements_text downstream.
      passengers: sql.json(normalizePassengers(r.passengers)),
      passenger_count: nullInt(r.passenger_count) ?? 0,
      aircraft: nullStr(r.aircraft),
      pilot: nullStr(r.pilot),
      flight_number: nullStr(r.flight_number),
      notes: nullStr(r.notes),
      distance_nm: nullFloat(r.distance_nm),
      duration_minutes: nullInt(r.duration_minutes),
      raw_json: sql.json(r),
    }));

    await sql`
      INSERT INTO flights ${sql(
        chunk,
        "id",
        "date",
        "source_doc",
        "departure",
        "arrival",
        "departure_code",
        "departure_name",
        "departure_city",
        "departure_country",
        "departure_lat",
        "departure_lon",
        "arrival_code",
        "arrival_name",
        "arrival_city",
        "arrival_country",
        "arrival_lat",
        "arrival_lon",
        "passengers",
        "passenger_count",
        "aircraft",
        "pilot",
        "flight_number",
        "notes",
        "distance_nm",
        "duration_minutes",
        "raw_json"
      )}
      ON CONFLICT (id) DO UPDATE SET
        date              = EXCLUDED.date,
        source_doc        = EXCLUDED.source_doc,
        departure         = EXCLUDED.departure,
        arrival           = EXCLUDED.arrival,
        departure_code    = EXCLUDED.departure_code,
        departure_name    = EXCLUDED.departure_name,
        departure_city    = EXCLUDED.departure_city,
        departure_country = EXCLUDED.departure_country,
        departure_lat     = EXCLUDED.departure_lat,
        departure_lon     = EXCLUDED.departure_lon,
        arrival_code      = EXCLUDED.arrival_code,
        arrival_name      = EXCLUDED.arrival_name,
        arrival_city      = EXCLUDED.arrival_city,
        arrival_country   = EXCLUDED.arrival_country,
        arrival_lat       = EXCLUDED.arrival_lat,
        arrival_lon       = EXCLUDED.arrival_lon,
        passengers        = EXCLUDED.passengers,
        passenger_count   = EXCLUDED.passenger_count,
        aircraft          = EXCLUDED.aircraft,
        pilot             = EXCLUDED.pilot,
        flight_number     = EXCLUDED.flight_number,
        notes             = EXCLUDED.notes,
        distance_nm       = EXCLUDED.distance_nm,
        duration_minutes  = EXCLUDED.duration_minutes,
        raw_json          = EXCLUDED.raw_json
    `;
    inserted += chunk.length;
    if (inserted % 1000 === 0 || inserted === rows.length) {
      log(`  ${inserted}/${rows.length}`);
    }
  }

  // A handful of rows can land with passengers stored as a JSON string
  // scalar ('"[]"') instead of an empty array — postgres.js quirk when the
  // upstream value is the string "[]". Normalize to a real array first.
  log("normalizing non-array passengers");
  const fixed = await sql`
    UPDATE flights SET passengers = '[]'::jsonb
    WHERE jsonb_typeof(passengers) != 'array'
    RETURNING id
  `;
  log(`normalized ${fixed.count ?? fixed.length} rows`);

  log("rebuilding search_vector");
  await sql.unsafe(`
    UPDATE flights SET search_vector = to_tsvector('english',
      coalesce(departure_name,'') || ' ' ||
      coalesce(arrival_name,'') || ' ' ||
      coalesce(departure_city,'') || ' ' ||
      coalesce(arrival_city,'') || ' ' ||
      coalesce(departure_country,'') || ' ' ||
      coalesce(arrival_country,'') || ' ' ||
      coalesce(departure_code,'') || ' ' ||
      coalesce(arrival_code,'') || ' ' ||
      coalesce(aircraft,'') || ' ' ||
      coalesce(pilot,'') || ' ' ||
      coalesce(notes,'') || ' ' ||
      coalesce((SELECT string_agg(value, ' ') FROM jsonb_array_elements_text(passengers)), '')
    )
  `);

  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM flights`;
  log(`flights table row count: ${n}`);

  const [{ min_date, max_date }] = await sql`
    SELECT MIN(date)::text AS min_date, MAX(date)::text AS max_date FROM flights
  `;
  log(`date range: ${min_date} → ${max_date}`);

  const topPax = await sql`
    SELECT passenger, COUNT(*)::int AS n FROM (
      SELECT jsonb_array_elements_text(passengers) AS passenger FROM flights
    ) sub
    GROUP BY passenger
    ORDER BY n DESC
    LIMIT 10
  `;
  log(`top passengers:`);
  for (const r of topPax) log(`  ${r.n.toString().padStart(5)}  ${r.passenger}`);

  log(`done — inserted ${inserted} flights`);
} catch (err) {
  console.error("\nSEED FAILED:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
} finally {
  await sql.end();
}
