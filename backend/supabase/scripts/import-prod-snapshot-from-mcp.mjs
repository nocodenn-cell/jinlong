#!/usr/bin/env node
/** Parse MCP json_agg migrations list dump → prod_schema_migrations.snapshot.json */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reports/prod_schema_migrations.snapshot.json');

function extractMigrationsArray(payload) {
  const key = '"migrations":';
  const keyIdx = payload.indexOf(key);
  if (keyIdx < 0) throw new Error('No migrations key in payload');
  const start = payload.indexOf('[', keyIdx);
  let depth = 0;
  for (let i = start; i < payload.length; i += 1) {
    const ch = payload[i];
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(payload.slice(start, i + 1));
    }
  }
  throw new Error('Unclosed migrations array');
}

const mcpPath = process.argv[2];
if (!mcpPath) {
  console.error('Usage: import-prod-snapshot-from-mcp.mjs <mcp-response.json>');
  process.exit(1);
}

const outer = JSON.parse(fs.readFileSync(mcpPath, 'utf8').trim());
const payload = typeof outer.result === 'string' ? outer.result : JSON.stringify(outer.result);
const migrations = extractMigrationsArray(payload);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'supabase_migrations.schema_migrations (read-only SELECT via MCP)',
      count: migrations.length,
      migrations,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${migrations.length} prod versions → ${OUT}`);
