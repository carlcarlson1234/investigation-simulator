import postgres from 'postgres';
import { writeFileSync } from 'fs';
const s = postgres('postgresql://postgres:postgres@localhost:5432/jmail');
const lines = [];

// Emails from Epstein
const r1 = await s`SELECT id, subject, sent_at, sender, sender_name FROM emails WHERE epstein_is_sender = true ORDER BY sent_at DESC NULLS LAST LIMIT 10`;
lines.push('=== Emails from Epstein ===');
r1.forEach(r => lines.push(`  ${r.id} | ${r.sent_at} | from:${r.sender_name || r.sender} | ${r.subject}`));

// Emails TO ghislaine/maxwell
const r2 = await s`SELECT id, subject, sent_at, sender, sender_name FROM emails WHERE body ILIKE '%ghislaine%' OR body ILIKE '%maxwell%' ORDER BY sent_at DESC NULLS LAST LIMIT 10`;
lines.push('\n=== Emails mentioning Ghislaine/Maxwell in body ===');
r2.forEach(r => lines.push(`  ${r.id} | ${r.sent_at} | from:${r.sender_name || r.sender} | ${r.subject}`));

// Get a couple of specific Maxwell photos with descriptions
const r3 = await s`SELECT p.id, p.raw_json->>'image_description' as descr FROM photos p JOIN photo_faces pf ON p.id = pf.photo_id WHERE pf.person_id = 'ghislaine-maxwell' LIMIT 10`;
lines.push('\n=== Maxwell photos with descriptions ===');
r3.forEach(r => lines.push(`  ${r.id} | ${(r.descr || 'no desc').slice(0, 120)}`));

// Documents - check if there are any at all
const r4 = await s`SELECT count(*)::int as c FROM documents`;
lines.push('\n=== Document count: ' + r4[0].c);

// Search documents by title
const r5 = await s`SELECT id, title, filename FROM documents WHERE title IS NOT NULL AND title != '' LIMIT 10`;
lines.push('\n=== Sample documents ===');
r5.forEach(r => lines.push(`  ${r.id} | ${r.title} | ${r.filename}`));

writeFileSync('scripts/starter-evidence.txt', lines.join('\n'), 'utf-8');
console.log('Done');
await s.end();
