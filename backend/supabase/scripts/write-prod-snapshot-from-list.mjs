#!/usr/bin/env node
/** Write prod_schema_migrations.snapshot.json from Supabase MCP list_migrations JSON on stdin. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reports/prod_schema_migrations.snapshot.json');

const raw = fs.readFileSync(0, 'utf8').trim();
const parsed = JSON.parse(raw);
const migrations = parsed.migrations ?? parsed;
if (!Array.isArray(migrations)) {
  console.error('Expected { migrations: [] } on stdin');
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'Supabase MCP list_migrations (read-only)',
      count: migrations.length,
      migrations,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${migrations.length} rows → ${OUT}`);
