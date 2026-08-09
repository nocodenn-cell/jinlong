#!/usr/bin/env node
/**
 * Backport from MCP execute_sql json_agg export: [{"version","name","statements"}, ...]
 * Usage: node scripts/backport-from-mcp-jsonagg-dump.mjs <mcp-response.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIG_DIR = path.join(ROOT, 'migrations');

function extractRows(mcpPath) {
  const outer = JSON.parse(fs.readFileSync(mcpPath, 'utf8').trim());
  const payload = typeof outer.result === 'string' ? outer.result : JSON.stringify(outer.result);

  const rowsKey = '"rows":';
  const keyIdx = payload.indexOf(rowsKey);
  if (keyIdx >= 0) {
    const start = payload.indexOf('[', keyIdx);
    let depth = 0;
    for (let i = start; i < payload.length; i += 1) {
      const ch = payload[i];
      if (ch === '[') depth += 1;
      if (ch === ']') {
        depth -= 1;
        if (depth === 0) {
          return JSON.parse(payload.slice(start, i + 1));
        }
      }
    }
    throw new Error(`Unclosed rows array in ${mcpPath}`);
  }

  const marker = '[{"version"';
  const start = payload.indexOf(marker);
  if (start < 0) throw new Error(`No migration array in ${mcpPath}`);
  let depth = 0;
  for (let i = start; i < payload.length; i += 1) {
    const ch = payload[i];
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(payload.slice(start, i + 1));
      }
    }
  }
  throw new Error(`Unclosed migration array in ${mcpPath}`);
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

const mcpPath = process.argv[2];
if (!mcpPath) {
  console.error('Usage: backport-from-mcp-jsonagg-dump.mjs <mcp-response.json>');
  process.exit(1);
}

const rows = extractRows(mcpPath);
const manifest = rows.map(writeMigration).filter(Boolean);
console.log(JSON.stringify(manifest, null, 2));
