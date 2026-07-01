#!/usr/bin/env node
/**
 * AUTHORITY GUARD — Contenção de escrita em tabelas críticas (ERP).
 *
 * Propósito (contenção, NÃO correção):
 *   Congelar o estado atual e IMPEDIR QUALQUER NOVO write direto em tabelas
 *   sensíveis. Este guard não resolve o sistema — ele impede regressão
 *   enquanto cada domínio é corrigido incrementalmente (Fases 1..5).
 *
 * Fonte de verdade = o SCANNER rodando sobre o código real.
 *   A ALLOWLIST abaixo é apenas um SNAPSHOT CONGELADO dos writes diretos que já
 *   existiam quando a contenção começou. Ela não é autoridade sobre "quais
 *   writes existem" — se código e allowlist divergirem, o scanner vence:
 *     - write novo fora do snapshot   → FALHA (novo bypass, bloqueia o PR).
 *     - entrada de allowlist sem write → marcada como STALE (remover a entrada).
 *
 * Tabelas críticas: caixas, movimentos_caixa, estoque, clientes, fornecedores.
 *
 * Modos:
 *   (default)   enforcement — usado por `npm run guard:all` / CI.
 *   --report    imprime os writes detectados (para docs/WRITE_PATHS_MAP.md) e
 *               sempre sai com código 0.
 *   --strict    trata warnings (ex.: movimentos_caixa) como falha.
 *
 * Toda mudança que introduza um novo write direto DEVE quebrar o CI antes do main.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT = process.argv.includes('--report')
const STRICT = process.argv.includes('--strict')

// Diretórios de produção — dev-tools e "jinlong layout" ficam fora destes dirs.
const PROD_DIRS = [
  path.join(root, 'pdv-importados'),
  path.join(root, 'backend', 'supabase', 'functions'),
]

// Tabela crítica → domínio, fase de correção, RPC canônica esperada e se o
// enforcement começa em modo "soft" (warn) em vez de hard-fail (adj. #4).
const CRITICAL_TABLES = {
  caixas: {
    domain: 'Caixa',
    phase: 'Fase 1 — CAIXA',
    canonicalRpc: 'abrir_caixa_atomicamente | fechar_caixa_atomico',
    soft: false,
  },
  movimentos_caixa: {
    domain: 'Caixa',
    phase: 'Fase 1 — CAIXA',
    canonicalRpc: 'registrar_movimento_caixa | fechar_caixa_atomico',
    // Hoje acredita-se ser RPC-only. Começa em warn para absorver qualquer site
    // pré-existente não mapeado sem quebrar o CI no dia 1; vira hard-fail depois
    // de um ciclo limpo (--strict força falha desde já).
    soft: true,
  },
  estoque: {
    domain: 'Estoque',
    phase: 'Fase 2 — ESTOQUE',
    canonicalRpc:
      'decrementar_estoque_seguro | ajustar_estoque_manual | transferencia_segura',
    soft: false,
  },
  clientes: {
    domain: 'Cadastros',
    phase: 'Fase 4 — CADASTROS',
    canonicalRpc: 'camada de domínio única (criarCliente server-only)',
    soft: false,
  },
  fornecedores: {
    domain: 'Cadastros',
    phase: 'Fase 4 — CADASTROS',
    canonicalRpc: 'camada de domínio única (writer único de fornecedores)',
    soft: false,
  },
}

const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete']

// RPCs de escrita conhecidas → domínio. RPC é o caminho SANCIONADO: chamadas são
// apenas ATRIBUÍDAS (report), nunca falham. Servem para o MAP e futuras regras
// de single-caller enxergarem a origem legítima.
const WRITE_RPCS = {
  abrir_caixa_atomicamente: 'Caixa',
  fechar_caixa_atomico: 'Caixa',
  recalcular_saldo_caixa: 'Caixa',
  decrementar_estoque_seguro: 'Estoque',
  ajustar_estoque_manual: 'Estoque',
  transferencia_segura: 'Estoque',
  importar_nfe_transacao: 'Cadastros/Fiscal',
  registrar_venda_com_itens: 'Venda/Caixa',
  finalizar_venda_transacional_canonica_v4: 'Venda/Caixa',
}

// Wrappers de escrita conhecidos (encapsulam um write crítico). CHAMADORES são
// atribuídos como "suspected" (report only) para não gerar falso-vermelho; a
// DEFINIÇÃO do wrapper é pega pela detecção direta normal.
const WRITE_WRAPPERS = {
  criarCliente: { domain: 'Cadastros', table: 'clientes' },
}

// -----------------------------------------------------------------------------
// SNAPSHOT ALLOWLIST — writes diretos que já existiam no início da contenção.
// relPath → { tables: [...], phase }. Encolher isto é subset-only: adicionar é
// bandeira vermelha; remover significa domínio corrigido. Reconciliado via
// `--report` (o scanner é a verdade).
// -----------------------------------------------------------------------------
const ALLOWLIST = {
  'pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts': {
    tables: ['caixas'],
    phase: 'Fase 1 — CAIXA',
  },
  'backend/supabase/functions/sync-outbox/index.ts': {
    tables: ['caixas'],
    phase: 'Fase 1 — CAIXA',
  },
  'pdv-importados/app/gerente/estoque/actions.ts': {
    tables: ['estoque'],
    phase: 'Fase 2 — ESTOQUE',
  },
  'pdv-importados/lib/adapters/supabase/produtoRepository.ts': {
    tables: ['estoque'],
    phase: 'Fase 2 — ESTOQUE',
  },
  'pdv-importados/app/gerente/produtos/actions.ts': {
    tables: ['estoque'],
    phase: 'Fase 2 — ESTOQUE',
  },
  'pdv-importados/app/gerente/clientes/actions.ts': {
    tables: ['clientes'],
    phase: 'Fase 4 — CADASTROS',
  },
  'pdv-importados/app/gerente/financeiro/actions.ts': {
    tables: ['clientes'],
    phase: 'Fase 4 — CADASTROS',
  },
  'pdv-importados/app/gerente/fornecedores/actions.ts': {
    tables: ['fornecedores'],
    phase: 'Fase 4 — CADASTROS',
  },
}

/**
 * Coleta recursivamente arquivos .ts/.tsx em dirs de produção.
 * Exclui: test/spec (mocks legítimos), e2e/ e database.types.ts (definições).
 */
function collectProdFiles(dirs) {
  const result = []
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'e2e' || e.name === 'node_modules') continue
        result.push(...collectProdFiles([full]))
      } else if (
        e.isFile() &&
        /\.(ts|tsx)$/.test(e.name) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(e.name) &&
        e.name !== 'database.types.ts'
      ) {
        result.push(full)
      }
    }
  }
  return result
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/**
 * Detecta writes diretos em tabelas críticas num texto de arquivo.
 * Robusto a: aliases de client (keia em `.from(` — qualquer receiver), cadeias
 * multi-linha (segmento até o próximo `.from(`), e ignora acesso `.select(`-only.
 * Retorna [{ table, op, line }].
 */
function detectDirectWrites(text) {
  const hits = []
  for (const table of Object.keys(CRITICAL_TABLES)) {
    const re = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`, 'g')
    let m
    while ((m = re.exec(text)) !== null) {
      const start = m.index + m[0].length
      // Segmento = até o próximo `.from(` ou +600 chars (fim provável do statement).
      const nextFrom = text.indexOf('.from(', start)
      const end = nextFrom === -1 ? Math.min(text.length, start + 600) : nextFrom
      const segment = text.slice(start, end)
      for (const op of WRITE_METHODS) {
        if (segment.includes(`.${op}(`)) {
          hits.push({ table, op, line: lineOf(text, m.index) })
        }
      }
    }
  }
  return hits
}

/** Detecta chamadas a RPCs de escrita conhecidas (report only). */
function detectWriteRpcs(text) {
  const hits = []
  const re = /\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g
  let m
  while ((m = re.exec(text)) !== null) {
    const name = m[1]
    if (WRITE_RPCS[name]) {
      hits.push({ rpc: name, domain: WRITE_RPCS[name], line: lineOf(text, m.index) })
    }
  }
  return hits
}

/** Detecta CHAMADORES de wrappers de escrita conhecidos (suspected, report only). */
function detectWrapperCalls(text) {
  const hits = []
  for (const [fn, meta] of Object.entries(WRITE_WRAPPERS)) {
    // Definição do wrapper neste arquivo → não é "chamador", é a origem direta.
    const isDefinition = new RegExp(
      `(function|const|let|var)\\s+${fn}\\b|\\b${fn}\\s*[:=]\\s*(async\\s*)?\\(`,
    ).test(text)
    if (isDefinition) continue
    const re = new RegExp(`\\b${fn}\\s*\\(`, 'g')
    let m
    while ((m = re.exec(text)) !== null) {
      hits.push({ wrapper: fn, ...meta, line: lineOf(text, m.index) })
    }
  }
  return hits
}

// -----------------------------------------------------------------------------
const prodFiles = collectProdFiles(PROD_DIRS)

const detectedByFile = new Map() // relPath → { direct:[], rpc:[], wrapper:[] }
for (const file of prodFiles) {
  const rel = path.relative(root, file).split(path.sep).join('/')
  const text = fs.readFileSync(file, 'utf8')
  const direct = detectDirectWrites(text)
  const rpc = detectWriteRpcs(text)
  const wrapper = detectWrapperCalls(text)
  if (direct.length || rpc.length || wrapper.length) {
    detectedByFile.set(rel, { direct, rpc, wrapper })
  }
}

// ---- Modo report: imprime tudo e sai 0 -------------------------------------
if (REPORT) {
  const stamp = new Date().toISOString().slice(0, 10)
  console.log(`# authority-guard --report (${stamp})`)
  console.log(`# tabelas críticas: ${Object.keys(CRITICAL_TABLES).join(', ')}\n`)
  console.log('## writes diretos (confirmed)')
  for (const [rel, d] of [...detectedByFile].sort()) {
    for (const h of d.direct) {
      const allow = ALLOWLIST[rel]?.tables.includes(h.table)
      console.log(
        `  ${rel}:${h.line}  ${h.table}.${h.op}  [${CRITICAL_TABLES[h.table].domain}]  ${allow ? 'allowlisted' : 'NOVO'}`,
      )
    }
  }
  console.log('\n## chamadas a RPC de escrita (sancionado / attributed)')
  for (const [rel, d] of [...detectedByFile].sort()) {
    for (const h of d.rpc) console.log(`  ${rel}:${h.line}  rpc:${h.rpc}  [${h.domain}]`)
  }
  console.log('\n## chamadores de wrapper de escrita (suspected)')
  for (const [rel, d] of [...detectedByFile].sort()) {
    for (const h of d.wrapper)
      console.log(`  ${rel}:${h.line}  ${h.wrapper}()→${h.table}  [${h.domain}]`)
  }
  process.exit(0)
}

// ---- Modo enforcement ------------------------------------------------------
const violations = [] // hard-fail
const warnings = [] // soft (movimentos_caixa) — falha só com --strict

for (const [rel, d] of detectedByFile) {
  for (const h of d.direct) {
    const allowed = ALLOWLIST[rel]?.tables.includes(h.table)
    if (allowed) continue
    const meta = CRITICAL_TABLES[h.table]
    const msg =
      `${rel}:${h.line} — write direto \`${h.table}.${h.op}(...)\` fora de RPC\n` +
      `      canonical RPC expected: ${meta.canonicalRpc}\n` +
      `      domínio afetado: ${meta.domain}\n` +
      `      fase de correção: ${meta.phase}`
    if (meta.soft && !STRICT) warnings.push(msg)
    else violations.push(msg)
  }
}

// Entradas de allowlist sem write correspondente → STALE (remover a entrada).
const staleEntries = []
for (const [rel, entry] of Object.entries(ALLOWLIST)) {
  const found = detectedByFile.get(rel)?.direct ?? []
  for (const table of entry.tables) {
    if (!found.some((h) => h.table === table)) {
      staleEntries.push(`${rel} → ${table} (write não encontrado; prune a entrada)`)
    }
  }
}

if (warnings.length > 0) {
  console.warn('[authority-guard] WARN — writes diretos em tabela soft-fail (movimentos_caixa):\n')
  for (const w of warnings) console.warn(`  - ${w}\n`)
  console.warn('  → Modo soft ativo: não quebra o CI ainda. Rode com --strict para exigir correção.\n')
}

if (staleEntries.length > 0) {
  console.warn('[authority-guard] WARN — entradas de allowlist obsoletas (STALE):\n')
  for (const s of staleEntries) console.warn(`  - ${s}\n`)
  console.warn('  → O write foi removido: encolha a ALLOWLIST (subset-only).\n')
}

if (violations.length > 0) {
  console.error('[authority-guard] FAIL — novo write direto em tabela crítica (bypass de RPC):\n')
  for (const v of violations) console.error(`  - ${v}\n`)
  console.error(
    '  → Contenção: todo write crítico passa por RPC/worker. Se este write é legítimo e\n' +
      '    pré-existente, adicione-o à ALLOWLIST em scripts/authority-guard.mjs (com a fase).\n' +
      '    Adicionar entrada é bandeira vermelha — prefira rotear pela RPC canônica.',
  )
  process.exit(1)
}

const n = [...detectedByFile.values()].reduce((a, d) => a + d.direct.length, 0)
console.log(
  `[authority-guard] OK — ${n} write(s) direto(s) crítico(s), todos no snapshot congelado. Nenhum novo bypass.`,
)
