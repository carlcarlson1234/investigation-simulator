import postgres from 'postgres';
import { writeFileSync } from 'fs';
const s = postgres('postgresql://postgres:postgres@localhost:5432/jmail');

// Find Epstein
const r1 = await s`SELECT id, name, raw_json->>'photo_count' as pc FROM people WHERE name ILIKE '%epstein%'`;

// Find top people by photo count
const r2 = await s`SELECT id, name, raw_json->>'photo_count' as pc FROM people WHERE (raw_json->>'photo_count')::int > 2 ORDER BY (raw_json->>'photo_count')::int DESC LIMIT 30`;

// Check for Jeffrey specifically
const r3 = await s`SELECT id, name FROM people WHERE name ILIKE '%jeffrey%' LIMIT 10`;

// Check thumbnails we already have
const r4 = await s`SELECT id, name FROM people WHERE id IN ('ghislaine-maxwell', 'bill-clinton', 'bill-gates', 'donald-trump', 'prince-andrew-duke-of-york', 'jean-luc-brunel')`;

const lines = [];
lines.push('=== Epstein search ===');
r1.forEach(r => lines.push(`  ${r.id} | ${r.name} | photos: ${r.pc}`));
lines.push('\n=== Jeffrey search ===');
r3.forEach(r => lines.push(`  ${r.id} | ${r.name}`));
lines.push('\n=== Top people by photo count ===');
r2.forEach(r => lines.push(`  ${r.id} | ${r.name} | photos: ${r.pc}`));
lines.push('\n=== Key people confirmed ===');
r4.forEach(r => lines.push(`  ${r.id} | ${r.name}`));

writeFileSync('scripts/people-ids.txt', lines.join('\n'), 'utf-8');
console.log('Done');
await s.end();
