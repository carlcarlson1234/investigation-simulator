import postgres from 'postgres';
const s = postgres('postgresql://postgres:postgres@localhost:5432/jmail');

// Insert Jeffrey Epstein into the people table
await s`
  INSERT INTO people (id, name, slug, aliases, description, image_url, email_addresses, raw_json)
  VALUES (
    'jeffrey-epstein',
    'Jeffrey Epstein',
    'jeffrey-epstein',
    '["Jeffrey Edward Epstein", "JE"]'::jsonb,
    'American financier and convicted sex offender. Subject of the Investigate The Files archive.',
    NULL,
    '["je@jfreyepstein.com"]'::jsonb,
    '{"id": "jeffrey-epstein", "name": "Jeffrey Epstein", "source": "manual", "photo_count": 0}'::jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    aliases = EXCLUDED.aliases,
    description = EXCLUDED.description,
    email_addresses = EXCLUDED.email_addresses,
    raw_json = EXCLUDED.raw_json
`;

// Verify
const r = await s`SELECT id, name, description, raw_json FROM people WHERE id = 'jeffrey-epstein'`;
console.log('Inserted:', JSON.stringify(r[0], null, 2));

await s.end();
