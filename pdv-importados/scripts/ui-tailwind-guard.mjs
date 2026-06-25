#!/usr/bin/env node
/**
 * UI Tailwind Guard (Sprint D — enforcement do Design System).
 *
 * Objetivo concreto: impedir REGRESSÃO arquitetural. Hoje existem utilitários
 * Tailwind com cor hardcoded (`bg-[#...]`, `text-[#...]`, `border-[#...]`)
 * espalhados por `app/` e `components/` — migrá-los de uma vez seria uma
 * "limpeza global" arriscada e fora de escopo. Em vez disso, este guard
 * funciona como uma CATRACA (ratchet): conta as violações atuais e falha o
 * build apenas se o número AUMENTAR. Assim:
 *   - código novo não pode introduzir cor hardcoded fora de `src/ui`;
 *   - a migração das violações existentes acontece de forma incremental,
 *     e cada arquivo migrado abaixa a baseline automaticamente (rodar com
 *     `--update` regrava a baseline).
 *
 * `src/ui/**` é a única área onde estilização/cor é permitida — ali o guard
 * não conta nada.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join, relative, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BASELINE_PATH = join(ROOT, "scripts", "ui-tailwind-guard.baseline.json")

// Diretórios escaneados. `src/ui` é deliberadamente o ÚNICO lugar permitido,
// então não entra na varredura.
const SCAN_DIRS = ["app", "components", "features"]
// `components/ui` é o sistema de primitives legado/atual (estilização permitida).
const ALLOW_PREFIXES = ["components/ui/", "src/ui/"]
const SKIP_DIR_NAMES = new Set(["node_modules", ".next", "dist", "build", "__snapshots__"])

// Cor hardcoded em utilitário Tailwind arbitrário: bg-[#hex] / text-[#hex] / border-[#hex].
const VIOLATION_RE = /\b(?:bg|text|border|ring|fill|stroke|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g

function walk(dir, acc) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry)) continue
      walk(full, acc)
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      acc.push(full)
    }
  }
}

function isAllowed(relPath) {
  return ALLOW_PREFIXES.some((p) => relPath.startsWith(p))
}

function collect() {
  const files = []
  for (const d of SCAN_DIRS) {
    const abs = join(ROOT, d)
    if (existsSync(abs)) walk(abs, files)
  }
  const byFile = {}
  let total = 0
  for (const file of files) {
    const rel = relative(ROOT, file).split("\\").join("/")
    if (isAllowed(rel)) continue
    const matches = readFileSync(file, "utf8").match(VIOLATION_RE)
    if (matches && matches.length > 0) {
      byFile[rel] = matches.length
      total += matches.length
    }
  }
  return { total, byFile }
}

const args = new Set(process.argv.slice(2))
const { total, byFile } = collect()

if (args.has("--update")) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ total, byFile }, null, 2) + "\n")
  console.error(`ui-tailwind-guard: baseline atualizada → ${total} violações.`)
  process.exit(0)
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  : { total: Number.POSITIVE_INFINITY, byFile: {} }

if (total > baseline.total) {
  console.error(
    `\n❌ ui-tailwind-guard: cor Tailwind hardcoded AUMENTOU (${baseline.total} → ${total}).`
  )
  console.error(
    "   Use tokens do Design System (@/ui) ou classes semânticas. Cor literal só em src/ui/**.\n"
  )
  // Mostra arquivos novos/aumentados para acelerar a correção.
  for (const [file, count] of Object.entries(byFile)) {
    const prev = baseline.byFile[file] ?? 0
    if (count > prev) console.error(`   +${count - prev}  ${file} (${prev} → ${count})`)
  }
  console.error("")
  process.exit(1)
}

const trend = total < baseline.total ? ` (↓ de ${baseline.total}; rode --update p/ travar)` : ""
console.error(`✅ ui-tailwind-guard: ${total} violações, dentro da baseline (${baseline.total})${trend}.`)
process.exit(0)
