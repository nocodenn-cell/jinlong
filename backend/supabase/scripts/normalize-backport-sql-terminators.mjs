#!/usr/bin/env node
/**
 * Garante `;` ao fim de cada statement em migrations backport Fase 1.
 * Export prod (schema_migrations.statements) costuma omitir terminadores;
 * o runner do Supabase divide por `;`.
 *
 * Uso:
 *   node supabase/scripts/normalize-backport-sql-terminators.mjs [--write]
 * Sem --write: apenas lista arquivos alteráveis.
 */
import fs from "node:fs";
import path from "node:path";

const MIG_DIR = path.resolve(import.meta.dirname, "../migrations");
const MARKER = "-- Backport Fase 1 (Git-only)";
const WRITE = process.argv.includes("--write");

function endsStatement(chunk) {
  const t = chunk.trimEnd();
  if (!t) return true;
  if (/^--/m.test(t) && !/^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|COMMENT|DO)\b/m.test(t)) {
    return true;
  }
  if (t.endsWith(";")) return true;
  if (t.endsWith("$$")) return false;
  return false;
}

function normalizeBody(body) {
  const parts = body.split(/\n\n/);
  const out = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    let block = part.replace(/\s+$/, "");
    if (!endsStatement(block)) {
      if (block.trimEnd().endsWith("$$")) {
        block = `${block};`;
      } else {
        block = `${block};`;
      }
    }
    out.push(block);
  }
  return `${out.join("\n\n")}\n`;
}

function processFile(filename) {
  const full = path.join(MIG_DIR, filename);
  const raw = fs.readFileSync(full, "utf8");
  if (!raw.includes(MARKER)) return null;

  const headerEnd = raw.indexOf("\n\n--");
  const headerEnd2 = raw.indexOf("\n\nCREATE");
  const splitAt = headerEnd2 > 0 ? headerEnd2 : headerEnd > 0 ? headerEnd : raw.indexOf("\n\n");
  if (splitAt < 0) return null;

  const header = raw.slice(0, splitAt + 1);
  const body = raw.slice(splitAt + 1);
  const normalized = normalizeBody(body);
  const next = header.endsWith("\n") ? header + normalized : `${header}\n${normalized}`;

  if (next === raw) return null;
  if (WRITE) fs.writeFileSync(full, next, "utf8");
  return filename;
}

const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));
const changed = [];
for (const f of files) {
  const c = processFile(f);
  if (c) changed.push(c);
}

if (WRITE) {
  console.log(`Normalized ${changed.length} backport file(s).`);
  for (const f of changed) console.log(`  - ${f}`);
} else {
  console.log(`Would normalize ${changed.length} file(s). Pass --write to apply.`);
  changed.forEach((f) => console.log(`  - ${f}`));
}
