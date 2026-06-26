#!/usr/bin/env node
/**
 * DESIGN SYSTEM GUARD — Fase 3.1 do roadmap "Design System + Estabilidade".
 *
 * Impede regressão do contrato de design. Dois tiers:
 *
 *  1. HARD BLOCK (falha sempre): uso de aliases legados no CÓDIGO DE UI
 *     (`components/`, `app/`) — classes utilitárias `*-oriental-*`.
 *     Hoje há ZERO ocorrências em UI; o guard mantém assim.
 *     As DEFINIÇÕES legadas em `styles/*.css` ainda existem e serão removidas
 *     na Fase 2 — por isso o escaneamento é restrito ao código consumidor.
 *     NOTA: a marca "dragon" (cores `--color-dragon-*`, temas `dragon-dark`/
 *     `dragon-light`, variante `tone="dragon"`) é LEGÍTIMA e não é bloqueada.
 *     O namespace `--jl-*` (design system atual) também permanece — sua
 *     migração para tokens semânticos é trabalho da Fase 2.
 *
 *  2. RATCHET (falha só se aumentar): cores hardcoded em className arbitrário
 *     (`bg-[#...]`, `border-[#...]`, etc.) que furam os tokens. Há um baseline
 *     de ocorrências existentes (limpeza é Fase 2); o guard falha apenas se o
 *     total ULTRAPASSAR o baseline — ou seja, bloqueia cores novas e permite
 *     que o baseline só diminua.
 *
 * Princípio: parar de "consertar erro" e começar a "impedir erro".
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pdv = path.join(root, 'pdv-importados')

// Código consumidor de UI. `styles/` fica de fora de propósito: ainda contém
// definições legadas que serão removidas na Fase 2 (ver cabeçalho).
const SCAN_DIRS = [
  path.join(pdv, 'components'),
  path.join(pdv, 'app'),
]

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'reports', 'storybook-static'])
const SCAN_EXT = /\.(ts|tsx)$/
const isTest = (name) => /\.(test|spec)\.(ts|tsx)$/.test(name)

// --- Tier 1: HARD BLOCK ---------------------------------------------------
// NOTA: a regra que bloqueava `bling` foi removida — "Bling" passou a ser o
// estilo-alvo do tema claro global (ver styles/theme-bling-light.css), não um
// alias legado.
const HARD_RULES = [
  { re: /\b(?:bg|text|border|ring|fill|stroke|from|via|to)-oriental-/, msg: 'classe utilitária legada `*-oriental-*`' },
]

// --- Tier 2: RATCHET (cores hardcoded em className) -----------------------
const HEX_CLASS_RE = /(?:bg|text|border|ring|fill|stroke|from|via|to|shadow|drop-shadow)-\[#[0-9a-fA-F]{3,8}/g
// Baseline medido na introdução do guard (Fase 1). Limpeza pertence à Fase 2;
// este número só pode DIMINUIR. Ao reduzir, atualize aqui.
const HEX_BASELINE = 79

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) out.push(...walk(p))
    } else if (SCAN_EXT.test(ent.name) && !isTest(ent.name)) {
      out.push(p)
    }
  }
  return out
}

const files = SCAN_DIRS.flatMap(walk)

const hardViolations = []
let hexCount = 0
const hexFiles = new Set()

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const rel = path.relative(root, file)

  text.split('\n').forEach((line, i) => {
    for (const { re, msg } of HARD_RULES) {
      if (re.test(line)) hardViolations.push(`${rel}:${i + 1}: ${msg}`)
    }
  })

  const matches = text.match(HEX_CLASS_RE)
  if (matches) {
    hexCount += matches.length
    hexFiles.add(rel)
  }
}

let failed = false

if (hardViolations.length > 0) {
  failed = true
  console.error('[design-system-guard] FAIL — alias legado reintroduzido (proibido):\n')
  for (const v of [...new Set(hardViolations)]) console.error(`  - ${v}`)
  console.error('\n  → Use os tokens de contrato (--surface, --surface-text, --accent, --border)\n    ou os tokens de tema apropriados. Aliases `oriental`/`bling` foram removidos.')
}

if (hexCount > HEX_BASELINE) {
  failed = true
  console.error(`\n[design-system-guard] FAIL — cores hardcoded acima do baseline (${hexCount} > ${HEX_BASELINE}).`)
  console.error(`  Novas classes do tipo \`bg-[#...]\`/\`border-[#...]\` foram adicionadas em ${hexFiles.size} arquivo(s).`)
  console.error('  → Use tokens (ex.: bg-jl-surface-base, border-jl-border-1) em vez de cores literais.')
  console.error('    A limpeza do baseline existente é trabalho da Fase 2 — não adicione cores novas.')
}

if (failed) process.exit(1)

console.log(
  `[design-system-guard] OK — sem aliases legados; cores hardcoded ${hexCount}/${HEX_BASELINE} (baseline, Fase 2).`,
)
