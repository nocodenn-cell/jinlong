#!/usr/bin/env node
/**
 * Parse MCP execute_sql dump where result is a JSON array of {version,name}.
 * Usage: node scripts/import-prod-snapshot-from-mcp-array.mjs <mcp-response.json>
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reports/prod_schema_migrations.snapshot.json');

function extractArray(payload) {
  const marker = '[{"version"';
  const start = payload.indexOf(marker);
  if (start < 0) throw new Error('No version array in MCP payload');
  let depth = 0;
  for (let i = start; i < payload.length; i += 1) {
    const ch = payload[i];
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(payload.slice(start, i + 1));
    }
  }
  throw new Error('Unclosed array in MCP payload');
}

const mcpPath = process.argv[2];
const outer = JSON.parse(fs.readFileSync(mcpPath, 'utf8').trim());
const payload = typeof outer.result === 'string' ? outer.result : JSON.stringify(outer.result);
const migrations = extractArray(payload);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'supabase_migrations.schema_migrations (read-only SELECT via MCP execute_sql)',
      count: migrations.length,
      migrations,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${migrations.length} → ${OUT}`);
