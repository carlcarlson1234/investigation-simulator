import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/jmail');

// Check photos table columns
const photoCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'photos' ORDER BY ordinal_position`;
process.stdout.write('PHOTO_COLS: ' + photoCols.map(c => c.column_name).join(', ') + '\n');

// Check photo_faces columns
const faceCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'photo_faces' ORDER BY ordinal_position`;
process.stdout.write('FACE_COLS: ' + faceCols.map(c => c.column_name).join(', ') + '\n');

// Sample photo raw_json keys and source_url
const photo = await sql`SELECT id, raw_json FROM photos LIMIT 1`;
if (photo.length) {
  const rj = photo[0].raw_json || {};
  process.stdout.write('PHOTO_KEYS: ' + Object.keys(rj).join(', ') + '\n');
  process.stdout.write('PHOTO_SRC: ' + (rj.source_url || rj.url || rj.image_url || 'NONE') + '\n');
}

// Maxwell face link with photo URL
const linked = await sql`
  SELECT pf.photo_id, pf.person_id, ph.raw_json as pjson
  FROM photo_faces pf
  JOIN photos ph ON ph.id = pf.photo_id
  WHERE pf.person_id ILIKE '%maxwell%'
  LIMIT 1
`;
if (linked.length) {
  const prj = linked[0].pjson || {};
  process.stdout.write('FACE_PHOTO_KEYS: ' + Object.keys(prj).join(', ') + '\n');
  process.stdout.write('FACE_PHOTO_SRC: ' + (prj.source_url || prj.url || 'NONE') + '\n');
}

// People with high photo counts
const ppl = await sql`
  SELECT id, name, slug FROM people 
  WHERE (raw_json->>'photo_count')::int > 5
  ORDER BY (raw_json->>'photo_count')::int DESC
  LIMIT 5
`;
process.stdout.write('TOP_PEOPLE: ' + ppl.map(p => p.name + '(' + p.id + ')').join(' | ') + '\n');

await sql.end();
