#!/usr/bin/env node
/**
 * Parse Supabase MCP execute_sql JSON dumps and write backport migration files.
 * Usage: node scripts/backport-from-mcp-dumps.mjs <dump1.json> [dump2...]
 * Each dump file: raw MCP tool output text containing JSON array of {version,name,statements}.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');
const MANIFEST = path.join(ROOT, 'reports/backport-phase1-manifest.json');

function parseMigrationArray(jsonText) {
  return JSON.parse(jsonText);
}

function extractArrayFromPayload(payload) {
  const marker = '[{"version"';
  const start = payload.indexOf(marker);
  if (start < 0) {
    throw new Error('No migrations JSON array in payload');
  }
  const end = payload.lastIndexOf('}]');
  if (end < 0) {
    throw new Error('No closing array in payload');
  }
  return parseMigrationArray(payload.slice(start, end + 2));
}

function extractRows(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (raw.startsWith('{')) {
    const outer = JSON.parse(raw);
    const payload = typeof outer.result === 'string' ? outer.result : raw;
    return extractArrayFromPayload(payload);
  }
  if (raw.startsWith('[{"version"')) {
    const end = raw.lastIndexOf('}]');
    return parseMigrationArray(raw.slice(0, end + 2));
  }
  throw new Error(`Unsupported dump format in ${filePath}`);
}

function normalizeStatements(statements) {
  return statements.map((s) => s.replace(/\r\n/g, '\n'));
}

function writeMigration(row) {
  const version = String(row.version);
  const name = String(row.name);
  const filename = `${version}_${name}.sql`;
  const outPath = path.join(MIG_DIR, filename);
  const skipExisting = SKIP_EXISTING;
  if (fs.existsSync(outPath)) {
    if (skipExisting) {
      const sql = fs.readFileSync(outPath, 'utf8');
      const sha256 = createHash('sha256').update(sql).digest('hex');
      return { version, name, file: filename, sha256, bytes: Buffer.byteLength(sql, 'utf8'), skipped: true };
    }
    throw new Error(`Already exists: ${filename}`);
  }
  const header = `-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: ${version}
-- name: ${name}
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

`;
  const body = normalizeStatements(row.statements).join('\n\n');
  const sql = header + body;
  fs.writeFileSync(outPath, sql, 'utf8');
  const sha256 = createHash('sha256').update(sql).digest('hex');
  return { version, name, file: filename, sha256, bytes: Buffer.byteLength(sql, 'utf8') };
}

const SKIP_EXISTING = process.argv.includes('--skip-existing');
const dumps = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (dumps.length === 0) {
  console.error('Usage: backport-from-mcp-dumps.mjs <dump-files...>');
  process.exit(1);
}

const manifest = [];
for (const dump of dumps) {
  const rows = extractRows(dump);
  for (const row of rows) {
    manifest.push(writeMigration(row));
  }
}

manifest.sort((a, b) => a.file.localeCompare(b.file));
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(
  MANIFEST,
  JSON.stringify({ generatedAt: new Date().toISOString(), count: manifest.length, migrations: manifest }, null, 2),
);
console.log(`Wrote ${manifest.length} migrations`);
for (const m of manifest) {
  console.log(m.file, m.sha256.slice(0, 12), m.bytes);
}
