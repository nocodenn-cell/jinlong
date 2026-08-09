#!/usr/bin/env node
/**
 * Extract {version,name,statements} from Supabase MCP execute_sql dump (single-row json_build_object format).
 * Usage: node scripts/backport-from-mcp-row-dump.mjs <mcp-response.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');

const dumps = process.argv.slice(2);
if (dumps.length === 0) {
  dumps.push('-');
}

function readOuter(source) {
  const raw = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8');
  return JSON.parse(raw.trim());
}

function extractRowFromOuter(outer) {
  const payload = typeof outer.result === 'string' ? outer.result : JSON.stringify(outer.result);
  const marker = '[{"row"';
  const start = payload.indexOf(marker);
  if (start < 0) throw new Error('No row array in MCP payload');
  const end = payload.lastIndexOf('}]');
  const arr = JSON.parse(payload.slice(start, end + 2));
  return arr[0].row;
}

function writeMigration(row) {
  const version = String(row.version);
  const name = String(row.name);
  const filename = `${version}_${name}.sql`;
  const outPath = path.join(MIG_DIR, filename);
  if (fs.existsSync(outPath)) {
    console.log('skip exists', filename);
    return null;
  }
  const header = `-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: ${version}
-- name: ${name}
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

`;
  const body = row.statements.map((s) => s.replace(/\r\n/g, '\n')).join('\n\n');
  const sql = header + body;
  fs.writeFileSync(outPath, sql, 'utf8');
  const sha256 = createHash('sha256').update(sql).digest('hex');
  return { version, name, file: filename, sha256, bytes: Buffer.byteLength(sql, 'utf8') };
}

const dumps = process.argv.slice(2);
const manifest = [];
for (const dump of dumps) {
  const row = extractRowFromOuter(readOuter(dump));
  const entry = writeMigration(row);
  if (entry) manifest.push(entry);
}
console.log(JSON.stringify(manifest, null, 2));
