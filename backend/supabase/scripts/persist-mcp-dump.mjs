#!/usr/bin/env node
/** Persist Supabase MCP execute_sql tool JSON (stdin) to a dump file for backport-from-mcp-dumps.mjs */
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('Usage: persist-mcp-dump.mjs <out.json> < tool-response.json');
  process.exit(1);
}
const raw = fs.readFileSync(0, 'utf8').trim();
JSON.parse(raw);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, raw, 'utf8');
console.log('Wrote', out, raw.length, 'bytes');
