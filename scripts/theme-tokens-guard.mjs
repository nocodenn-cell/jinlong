#!/usr/bin/env node
/**
 * THEME TOKENS GUARD — contrato do sistema de temas (Design System Clássico).
 *
 * Torna mecânicas e previsíveis as migrações de UI: a superfície oficial do
 * Design System NÃO pode acoplar cor a valores fixos nem resolver tokens fora
 * do escopo de tema. Roda em `npm run guard:all` (CI) — bloqueia o merge.
 *
 * Regras invariantes verificadas nos arquivos POLICIADOS (.ts/.tsx):
 *   1. Proibido hardcode de cor:
 *        • utilitários Tailwind de paleta numerada (ex.: text-red-400, bg-amber-400);
 *        • hex em valor arbitrário (ex.: text-[#c9a227], border-[#242424]);
 *        • rgba()/hsl() literais em valor arbitrário (ex.: bg-[rgba(251,191,36,.1)]).
 *      Use tokens: jl-* / --jl-* / --color-* / --admin-v2-* / --cl-* ou as
 *      classes semânticas shadcn (success, destructive, primary, muted, border,
 *      background, foreground, ring, accent, card, popover, secondary).
 *   2. Proibido resolver tokens via :root em contexto de tema:
 *        • getComputedStyle(document.documentElement) — gráficos/canvas DEVEM
 *          resolver a partir do elemento escopado [data-theme] (ex.: o <canvas>).
 *
 * Exceção pontual e auditável: adicione `theme-guard-allow` (idealmente com um
 * motivo) na MESMA linha para liberar um caso legítimo (ex.: fallback de SSR).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Superfície oficial do Design System + módulos já migrados (CLASSICO_ROUTES).
 * Ao migrar um novo módulo, adicione o diretório/página dele aqui.
 */
const POLICED = [
  'pdv-importados/components/ui/admin-v2',
  'pdv-importados/app/admin/dashboard/page.tsx',
]

const ALLOW_MARKER = 'theme-guard-allow'

// Famílias de paleta do Tailwind que indicam cor fixa (não-tokenizada).
const PALETTE = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]
const UTIL_PREFIX = '(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|divide|outline|decoration|caret|accent|shadow|placeholder)'

const RULES = [
  {
    id: 'palette-utility',
    re: new RegExp(`\\b${UTIL_PREFIX}-(?:${PALETTE.join('|')})-[0-9]{2,3}\\b`),
    msg: 'utilitário Tailwind de paleta numerada (cor fixa) — use um token do Design System',
  },
  {
    id: 'hex-arbitrary',
    re: /-\[#[0-9a-fA-F]{3,8}\]/,
    msg: 'hex em valor arbitrário — use var(--jl-*/--color-*/--admin-v2-*) ou classe semântica',
  },
  {
    id: 'color-fn-arbitrary',
    re: /-\[(?:rgba?|hsla?)\(/,
    msg: 'rgba()/hsl() literal em valor arbitrário — use um token de cor',
  },
  {
    id: 'root-token-resolution',
    re: /getComputedStyle\(\s*document\.documentElement\s*\)/,
    msg: 'resolução de token via :root — resolva a partir do elemento escopado [data-theme]',
  },
]

function listFiles(target) {
  const abs = path.join(root, target)
  if (!fs.existsSync(abs)) return []
  const stat = fs.statSync(abs)
  if (stat.isFile()) return [abs]
  const out = []
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = path.join(abs, entry.name)
    if (entry.isDirectory()) {
      out.push(...listFiles(path.relative(root, child)))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|behavior\.test)\.(ts|tsx)$/.test(entry.name)) {
      out.push(child)
    }
  }
  return out
}

const files = [...new Set(POLICED.flatMap(listFiles))]
const violations = []

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        violations.push({
          file: path.relative(root, file),
          line: i + 1,
          rule: rule.id,
          msg: rule.msg,
          snippet: line.trim().slice(0, 100),
        })
      }
    }
  })
}

if (files.length === 0) {
  console.error('[theme-tokens-guard] FAIL — nenhum arquivo policiado encontrado (POLICED desatualizado?)')
  process.exit(1)
}

if (violations.length > 0) {
  console.error(`[theme-tokens-guard] FAIL — ${violations.length} acoplamento(s) visual(is) fora do sistema de temas:\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`)
    console.error(`    → ${v.msg}`)
    console.error(`    | ${v.snippet}`)
  }
  console.error('\n  Use tokens do Design System ou, em caso legítimo, marque a linha com `theme-guard-allow <motivo>`.')
  process.exit(1)
}

console.log(`[theme-tokens-guard] OK — ${files.length} arquivos da superfície do Design System sem hardcode de cor nem resolução via :root`)
