#!/usr/bin/env node
/**
 * THEME TOKENS GUARD — contrato do sistema de temas (Design System Clássico).
 *
 * Torna mecânicas e previsíveis as migrações de UI: a superfície oficial do
 * Design System NÃO pode acoplar cor a valores fixos nem resolver tokens fora
 * do escopo de tema. Roda em `npm run guard:all` (CI) — bloqueia o merge.
 *
 * REGRAS INVARIANTES (nos arquivos POLICIADOS .ts/.tsx):
 *   • palette-utility ......... utilitário Tailwind de paleta numerada (ex.: text-red-400)
 *   • hex-arbitrary ........... hex em valor arbitrário (ex.: text-[#c9a227])
 *   • color-fn-arbitrary ...... rgba()/hsl() literal em valor arbitrário
 *   • root-token-resolution ... getComputedStyle(document.documentElement)
 *   Use tokens (jl-* / --jl-* / --color-* / --admin-v2-* / --cl-*) ou classes
 *   semânticas shadcn (success, destructive, primary, muted, border, background,
 *   foreground, ring, accent, card, popover, secondary).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MODELO DE EXCEÇÃO AUDITÁVEL (Fase 2.0) — nenhuma regra é "bypassável" sem
 * registro explícito e rastreável. Override é por REGRA, na MESMA linha:
 *
 *   // theme-guard-allow:<ruleId> <justificativa obrigatória> [until=AAAA-MM-DD]
 *
 *   exemplos:
 *     theme-guard-allow:palette-utility cor de marca legada (remoção em #123)
 *     theme-guard-allow:hex-arbitrary tooltip de terceiro until=2026-09-01
 *
 * Regras do override (qualquer violação é FALHA do guard):
 *   - ruleId DEVE ser um id de regra conhecido (ou `*` para todas, desencorajado);
 *   - justificativa é OBRIGATÓRIA (mín. 8 caracteres);
 *   - `until=AAAA-MM-DD` é opcional; se presente e vencido ⇒ FALHA (TTL expirado);
 *   - o override só suprime a regra nomeada (não as demais da mesma linha).
 *
 * O guard imprime um INVENTÁRIO DE AUDITORIA de todas as exceções ativas
 * (arquivo:linha, regra, justificativa, validade, uso) — rastreável no CI e no git.
 *
 * LIMITES (o que o guard NÃO cobre) — ver docs/THEME_SYSTEM.md §"Limites do guard".
 * ─────────────────────────────────────────────────────────────────────────────
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
const RULE_IDS = new Set(RULES.map((r) => r.id))
const MIN_REASON_LEN = 8
const ALLOW_RE = /theme-guard-allow:(\S+)/

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Faz o parse do override de uma linha. Retorna `null` se não houver diretiva.
 * Caso haja, retorna {ruleId, reason, until, errors[]} — `errors` não-vazio = override inválido.
 */
function parseOverride(line) {
  const m = ALLOW_RE.exec(line)
  if (!m) return null
  const ruleId = m[1]
  // Limita ao corpo do comentário: não engole código após `*/` (ou `-->`).
  let rest = line.slice(m.index + m[0].length)
  for (const close of ['*/', '-->']) {
    const at = rest.indexOf(close)
    if (at >= 0) rest = rest.slice(0, at)
  }
  const untilMatch = /until=(\S+)/.exec(rest)
  const until = untilMatch ? untilMatch[1] : null
  const reason = rest.replace(/until=\S+/, '').replace(/^[\s:]+|[\s*/]+$/g, '').trim()

  const errors = []
  if (ruleId !== '*' && !RULE_IDS.has(ruleId)) {
    errors.push(`ruleId desconhecido "${ruleId}" (conhecidos: ${[...RULE_IDS].join(', ')}, ou *)`)
  }
  if (reason.length < MIN_REASON_LEN) {
    errors.push(`justificativa obrigatória ausente/curta (mín. ${MIN_REASON_LEN} caracteres)`)
  }
  if (until !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      errors.push(`data de validade inválida "${until}" (use until=AAAA-MM-DD)`)
    } else if (until < todayISO()) {
      errors.push(`exceção expirada em ${until} (TTL vencido) — resolva ou renove`)
    }
  }
  return { ruleId, reason, until, errors }
}

function suppresses(override, ruleId) {
  return override.errors.length === 0 && (override.ruleId === '*' || override.ruleId === ruleId)
}

function listFiles(target) {
  const abs = path.join(root, target)
  if (!fs.existsSync(abs)) return []
  if (fs.statSync(abs).isFile()) return [abs]
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
const violations = []     // hardcode não-suprimido
const badOverrides = []   // override malformado/expirado
const activeExceptions = [] // exceções válidas (para auditoria)

for (const file of files) {
  const rel = path.relative(root, file)
  const lines = fs.readFileSync(file, 'utf8').split('\n')

  // 1) Parse de todas as diretivas. Override válido pode estar na MESMA linha da
  //    violação ou na linha IMEDIATAMENTE ANTERIOR (ergonomia p/ className JSX).
  const overrides = lines.map((line, i) => {
    const ov = parseOverride(line)
    if (ov) ov._used = false
    if (ov && ov.errors.length > 0) {
      badOverrides.push({ file: rel, line: i + 1, ruleId: ov.ruleId, errors: ov.errors, snippet: line.trim().slice(0, 100) })
    }
    return ov
  })

  // 2) Violações, consultando override da mesma linha e da linha anterior.
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (!rule.re.test(line)) continue
      const candidates = [overrides[i], overrides[i - 1]]
      const ov = candidates.find((o) => o && suppresses(o, rule.id))
      if (ov) {
        ov._used = true
        continue // suprimido por exceção válida
      }
      violations.push({ file: rel, line: i + 1, rule: rule.id, msg: rule.msg, snippet: line.trim().slice(0, 100) })
    }
  })

  // 3) Inventário das exceções válidas (com flag de uso).
  overrides.forEach((ov, i) => {
    if (ov && ov.errors.length === 0) {
      activeExceptions.push({ file: rel, line: i + 1, ruleId: ov.ruleId, reason: ov.reason, until: ov.until, used: ov._used })
    }
  })
}

// ── Inventário de auditoria das exceções ativas ───────────────────────────────
if (activeExceptions.length > 0) {
  console.log(`[theme-tokens-guard] AUDITORIA — ${activeExceptions.length} exceção(ões) registrada(s):`)
  for (const e of activeExceptions) {
    const ttl = e.until ? `expira ${e.until}` : 'sem expiração'
    const usage = e.used ? 'em uso' : 'NÃO USADA (candidata a remoção)'
    console.log(`  • ${e.file}:${e.line}  [${e.ruleId}]  (${ttl}; ${usage})`)
    console.log(`      motivo: ${e.reason}`)
  }
  console.log('')
}

if (files.length === 0) {
  console.error('[theme-tokens-guard] FAIL — nenhum arquivo policiado encontrado (POLICED desatualizado?)')
  process.exit(1)
}

let failed = false

if (badOverrides.length > 0) {
  failed = true
  console.error(`[theme-tokens-guard] FAIL — ${badOverrides.length} override(s) inválido(s) (toda exceção deve ser registrada corretamente):\n`)
  for (const b of badOverrides) {
    console.error(`  ${b.file}:${b.line}  [theme-guard-allow:${b.ruleId}]`)
    for (const err of b.errors) console.error(`    → ${err}`)
    console.error(`    | ${b.snippet}`)
  }
  console.error('')
}

if (violations.length > 0) {
  failed = true
  console.error(`[theme-tokens-guard] FAIL — ${violations.length} acoplamento(s) visual(is) fora do sistema de temas:\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`)
    console.error(`    → ${v.msg}`)
    console.error(`    | ${v.snippet}`)
  }
  console.error('\n  Use tokens do Design System ou registre uma exceção auditável:')
  console.error('  // theme-guard-allow:<ruleId> <justificativa> [until=AAAA-MM-DD]')
}

if (failed) process.exit(1)

console.log(`[theme-tokens-guard] OK — ${files.length} arquivos da superfície do Design System sem hardcode de cor nem resolução via :root`)
