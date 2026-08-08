#!/usr/bin/env node
/** Merge MCP execute_sql chunk dumps (version/name arrays) into prod snapshot + reconcile report. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');
const SNAPSHOT = path.join(ROOT, 'reports/prod_schema_migrations.snapshot.json');
const RECONCILE_OUT = path.join(ROOT, 'reports/reconcile-prod-repo-inventory.json');

function extractArrayFromMcpFile(mcpPath) {
  const outer = JSON.parse(fs.readFileSync(mcpPath, 'utf8').trim());
  const payload = typeof outer.result === 'string' ? outer.result : JSON.stringify(outer.result);
  const marker = '[{"version"';
  const start = payload.indexOf(marker);
  if (start < 0) throw new Error(`No array in ${mcpPath}`);
  let depth = 0;
  for (let i = start; i < payload.length; i += 1) {
    const ch = payload[i];
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(payload.slice(start, i + 1));
    }
  }
  throw new Error(`Unclosed array in ${mcpPath}`);
}

const chunkFiles = process.argv.slice(2);
if (chunkFiles.length === 0) {
  console.error('Usage: merge-prod-snapshot-chunks.mjs <mcp-chunk.json> ...');
  process.exit(1);
}

const migrations = chunkFiles.flatMap(extractArrayFromMcpFile);
fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
fs.writeFileSync(
  SNAPSHOT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'supabase_migrations.schema_migrations (read-only SELECT chunks via MCP)',
      count: migrations.length,
      migrations,
    },
    null,
    2,
  ),
);
console.log('Wrote snapshot', migrations.length);

// inline reconcile (same logic as reconcile-prod-repo-inventory.mjs)
function parseFile(filename) {
  const base = filename.replace(/\.sql$/, '');
  const ts = base.match(/^(\d{14})_(.+)$/);
  if (ts) return { version: ts[1], slug: ts[2], file: filename };
  const num = base.match(/^(\d+)_(.+)$/);
  if (num) return { version: num[1], slug: num[2], file: filename };
  return { version: base, slug: base, file: filename };
}

const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
const repo = files.map((f) => ({ ...parseFile(f), path: path.join(MIG_DIR, f) }));
const prodByVersion = new Map(migrations.map((m) => [String(m.version), m]));
const repoByVersion = new Map(repo.map((r) => [r.version, r]));
const onlyRepo = repo.filter((r) => !prodByVersion.has(r.version));
const onlyProd = migrations.filter((m) => !repoByVersion.has(String(m.version)));

const sha12 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12);

const out = {
  generatedAt: new Date().toISOString(),
  counts: {
    repoFiles: repo.length,
    prodTracked: migrations.length,
    onlyRepo: onlyRepo.length,
    onlyProd: onlyProd.length,
  },
  onlyRepo: onlyRepo.map((r) => ({ version: r.version, file: r.file, sha12: sha12(r.path) })),
  onlyProd: onlyProd.map((m) => ({ version: m.version, name: m.name })),
};
fs.writeFileSync(RECONCILE_OUT, JSON.stringify(out, null, 2));
console.log('Reconcile:', out.counts);
