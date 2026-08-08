#!/usr/bin/env node
/**
 * Build prod_schema_migrations.snapshot.json from TSV (version<TAB>name per line).
 * Read-only inventory helper — Fase 2 reconciliação.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const IN = process.argv[2] ?? path.join(ROOT, 'reports/prod_migrations.tsv');
const OUT = path.join(ROOT, 'reports/prod_schema_migrations.snapshot.json');

const raw = fs.readFileSync(IN, 'utf8').trim();
const migrations = raw
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const tab = line.indexOf('\t');
    if (tab === -1) {
      throw new Error(`Invalid line (no tab): ${line.slice(0, 40)}`);
    }
    return { version: line.slice(0, tab), name: line.slice(tab + 1) };
  });

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'Supabase MCP execute_sql string_agg (read-only)',
      count: migrations.length,
      migrations,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${migrations.length} rows → ${OUT}`);
