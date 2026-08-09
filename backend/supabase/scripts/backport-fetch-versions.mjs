#!/usr/bin/env node
/**
 * Fetch prod migration rows (read-only SELECT) and write backport SQL files.
 * Requires SUPABASE_ACCESS_TOKEN or uses embedded MCP dumps in reports/mcp-dumps/{version}.json
 *
 * Usage: node scripts/backport-fetch-versions.mjs <version> [version...]
 * Each version needs reports/mcp-dumps/<version>.json (full Supabase MCP execute_sql JSON).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const versions = process.argv.slice(2);
if (versions.length === 0) {
  console.error('Usage: backport-fetch-versions.mjs <version> ...');
  process.exit(1);
}

const script = path.join(ROOT, 'scripts/backport-from-mcp-row-dump.mjs');
const dumps = [];
for (const v of versions) {
  const dumpPath = path.join(ROOT, 'reports/mcp-dumps', `${v}.json`);
  if (!fs.existsSync(dumpPath)) {
    console.error('Missing dump:', dumpPath);
    process.exit(1);
  }
  dumps.push(dumpPath);
}

const r = spawnSync(process.execPath, [script, ...dumps], { stdio: 'inherit' });
process.exit(r.status ?? 1);
