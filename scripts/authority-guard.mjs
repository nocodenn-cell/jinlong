#!/usr/bin/env node
/**
 * AUTHORITY GUARD — Contenção de escrita em tabelas críticas (ERP).
 *
 * MODELO (leia antes de mexer):
 *
 *   • CODE-AS-TRUTH. A única fonte de detecção é o SCANNER rodando sobre o
 *     código vivo. Nenhum inventário (docs/WRITE_PATHS_MAP.md) participa do
 *     enforcement — o MAP é só observabilidade/debug.
 *
 *   • A REGRA (política) é fixa: "nenhum write direto em tabela crítica fora de
 *     um caminho permitido". Quem decide violação é o scanner + esta regra.
 *
 *   • O GRANDFATHERED_SNAPSHOT abaixo NÃO é autoridade de execução. É apenas um
 *     registro histórico auxiliar dos writes diretos que já existiam quando a
 *     contenção começou, tolerados de forma TRANSITÓRIA até a fase que os remove.
 *     Ele não pode ser tratado como "verdade operacional": se o código mudar, o
 *     scanner vence (write novo → falha; entrada sem write → STALE, remover).
 *
 *   • RPC NÃO é "trusted". RPC é apenas um "allowed path" — estruturalmente
 *     permitido, mas pode falhar logicamente. Chamadas de RPC são só ATRIBUÍDAS
 *     (observabilidade), nunca conferem confiança.
 *
 *   • Domínio financeiro não tolera fail-soft permanente. `movimentos_caixa` é
 *     hard-fail. Soft só existe como janela TRANSITÓRIA datada (self-expiring).
 *
 * Tabelas críticas: caixas, movimentos_caixa, estoque, clientes, fornecedores.
 *
 * Modos:
 *   (default)   enforcement — usado por `npm run guard:all` / CI.
 *   --report    imprime o grafo de autoridade de escrita detectado (para o MAP)
 *               e sempre sai 0.
 *   --strict    trata qualquer janela soft transitória como falha imediata.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPORT = process.argv.includes('--report')
const STRICT = process.argv.includes('--strict')
const TODAY = new Date().toISOString().slice(0, 10)

// Diretórios de produção — dev-tools e "jinlong layout" ficam fora destes dirs.
const PROD_DIRS = [
  path.join(root, 'pdv-importados'),
  path.join(root, 'backend', 'supabase', 'functions'),
]

// Tabela crítica → domínio, fase de correção e RPC canônica (allowed path, NÃO trusted).
const CRITICAL_TABLES = {
  caixas: {
    domain: 'Caixa',
    phase: 'Fase 1 — CAIXA',
    canonicalRpc: 'abrir_caixa_atomicamente | fechar_caixa_atomico',
  },
  movimentos_caixa: {
    domain: 'Caixa',
    phase: 'Fase 1 — CAIXA',
    canonicalRpc: 'registrar_movimento_caixa | fechar_caixa_atomico',
  },
  estoque: {
    domain: 'Estoque',
    phase: 'Fase 2 — ESTOQUE',
    canonicalRpc:
      'decrementar_estoque_seguro | ajustar_estoque_manual | transferencia_segura',
  },
  clientes: {
    domain: 'Cadastros',
    phase: 'Fase 4 — CADASTROS',
    canonicalRpc: 'camada de domínio única (writer único de clientes)',
  },
  fornecedores: {
    domain: 'Cadastros',
    phase: 'Fase 4 — CADASTROS',
    canonicalRpc: 'camada de domínio única (writer único de fornecedores)',
  },
}

const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete']

// -----------------------------------------------------------------------------
// JANELA SOFT TRANSITÓRIA (adj. #6) — self-expiring. Fail-soft NUNCA é permanente:
// tabela → data de expiração (YYYY-MM-DD). Depois da data (ou com --strict), vira
// hard-fail como qualquer outro domínio. Atualmente VAZIO: `movimentos_caixa` é
// hard-fail desde já (o scanner não encontrou nenhum write direto pré-existente).
const TRANSITIONAL_SOFT_UNTIL = {
  // exemplo: movimentos_caixa: '2026-07-08',
}
const isSoftNow = (table) => {
  const until = TRANSITIONAL_SOFT_UNTIL[table]
  return !STRICT && typeof until === 'string' && TODAY <= until
}

// RPCs de escrita conhecidas → domínio. ALLOWED PATH, não trusted. Só atribuição.
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

// Aliases de client conhecidos + padrões de fábrica. Usados para RESOLUÇÃO DE
// ALIAS (adj. #4): reduzir bypass por renomear o client. A detecção de `.from(`
// é superset (pega qualquer receiver), mas resolvemos aliases explicitamente para
// classificar a origem e documentar o modelo.
const CLIENT_ALIASES = ['supabase', 'supabaseClient', 'db', 'client', 'admin', 'sb']
const CLIENT_FACTORY_RE =
  /\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:await\s+)?(?:createClient|createAdminClient|createServiceClient|createServerClient|getSupabase[A-Za-z]*)\s*\(/g

// -----------------------------------------------------------------------------
// GRANDFATHERED SNAPSHOT — registro histórico auxiliar (NÃO autoridade, adj. #1).
// relPath → { tables:[...], phase }. Writes diretos que já existiam no início da
// contenção, tolerados de forma transitória até a fase que os remove. Encolher é
// subset-only. Reconciliado via `--report` (scanner é a verdade).
// -----------------------------------------------------------------------------
const GRANDFATHERED = {
  'pdv-importados/app/caixa/server/caixaSessaoOperador.impl.ts': { tables: ['caixas'], phase: 'Fase 1 — CAIXA' },
  'backend/supabase/functions/sync-outbox/index.ts': { tables: ['caixas'], phase: 'Fase 1 — CAIXA' },
  'pdv-importados/app/gerente/estoque/actions.ts': { tables: ['estoque'], phase: 'Fase 2 — ESTOQUE' },
  'pdv-importados/lib/adapters/supabase/produtoRepository.ts': { tables: ['estoque'], phase: 'Fase 2 — ESTOQUE' },
  'pdv-importados/app/gerente/produtos/actions.ts': { tables: ['estoque'], phase: 'Fase 2 — ESTOQUE' },
  'pdv-importados/app/gerente/clientes/actions.ts': { tables: ['clientes'], phase: 'Fase 4 — CADASTROS' },
  'pdv-importados/app/gerente/financeiro/actions.ts': { tables: ['clientes'], phase: 'Fase 4 — CADASTROS' },
  'pdv-importados/app/gerente/fornecedores/actions.ts': { tables: ['fornecedores'], phase: 'Fase 4 — CADASTROS' },
}
const isGrandfathered = (rel, table) => GRANDFATHERED[rel]?.tables.includes(table) ?? false

/** Recursivamente coleta .ts/.tsx de produção. Exclui test/spec, e2e/, database.types.ts. */
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
const relOf = (file) => path.relative(root, file).split(path.sep).join('/')
// Origem/autoridade estrutural pelo local do arquivo (Write Authority Graph, adj. #7).
const originOf = (rel) => (rel.includes('/functions/') ? 'worker' : 'client')

/** Lista de declarações de função {name, index} num texto (para indireção nível 1). */
function functionDecls(text) {
  const decls = []
  const re =
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/g
  let m
  while ((m = re.exec(text)) !== null) {
    decls.push({ name: m[1] || m[2], index: m.index })
  }
  return decls
}
/** Função que envolve um índice: declaração mais próxima antes dele. */
function enclosingFn(decls, index) {
  let best = null
  for (const d of decls) {
    if (d.index < index && (!best || d.index > best.index)) best = d
  }
  return best?.name ?? null
}

/**
 * Detecta writes diretos em tabelas críticas.
 * Robusto a: aliases de client (keia em `.from(` — qualquer receiver), cadeias
 * multi-linha (segmento até o próximo `.from(`); ignora `.select(`-only.
 * Retorna [{ table, op, line, fn }] onde fn = função que envolve o write.
 */
function detectDirectWrites(text, decls) {
  const hits = []
  for (const table of Object.keys(CRITICAL_TABLES)) {
    const re = new RegExp(`\\.from\\(\\s*['"\`]${table}['"\`]\\s*\\)`, 'g')
    let m
    while ((m = re.exec(text)) !== null) {
      const start = m.index + m[0].length
      const nextFrom = text.indexOf('.from(', start)
      const end = nextFrom === -1 ? Math.min(text.length, start + 600) : nextFrom
      const segment = text.slice(start, end)
      for (const op of WRITE_METHODS) {
        if (segment.includes(`.${op}(`)) {
          hits.push({ table, op, line: lineOf(text, m.index), fn: enclosingFn(decls, m.index) })
        }
      }
    }
  }
  return hits
}

/** Chamadas a RPCs de escrita (allowed path, NÃO trusted — só atribuição). */
function detectWriteRpcs(text) {
  const hits = []
  const re = /\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g
  let m
  while ((m = re.exec(text)) !== null) {
    if (WRITE_RPCS[m[1]]) hits.push({ rpc: m[1], domain: WRITE_RPCS[m[1]], line: lineOf(text, m.index) })
  }
  return hits
}

/** Aliases de client resolvidos neste arquivo (fábrica → nome de variável). */
function detectClientAliases(text) {
  const found = new Set()
  let m
  CLIENT_FACTORY_RE.lastIndex = 0
  while ((m = CLIENT_FACTORY_RE.exec(text)) !== null) found.add(m[1])
  for (const a of CLIENT_ALIASES) if (new RegExp(`\\b${a}\\.from\\(`).test(text)) found.add(a)
  return [...found]
}

// -----------------------------------------------------------------------------
// PASSO 1 — varre todos os arquivos, coleta writes diretos e funções de escrita.
const prodFiles = collectProdFiles(PROD_DIRS)
const perFile = new Map() // rel → { text, decls, direct, rpc, aliases }
const writeFunctions = new Map() // nome de função → { table, domain, defRel } (indireção)

for (const file of prodFiles) {
  const rel = relOf(file)
  const text = fs.readFileSync(file, 'utf8')
  const decls = functionDecls(text)
  const direct = detectDirectWrites(text, decls)
  const rpc = detectWriteRpcs(text)
  const aliases = detectClientAliases(text)
  perFile.set(rel, { text, direct, rpc, aliases })
  for (const h of direct) {
    // Função nomeada que contém um write direto vira "write-function" (análise
    // de função, não hardcode). Nomes muito genéricos são ignorados.
    if (h.fn && h.fn.length > 3) {
      writeFunctions.set(h.fn, { table: h.table, domain: CRITICAL_TABLES[h.table].domain, defRel: rel })
    }
  }
}

// PASSO 2 — indireção nível 1 (adj. #4): chamadores de write-functions em OUTROS
// arquivos. Observabilidade apenas (heurístico) — nunca hard-fail.
const indirect = [] // { rel, line, via, table, domain }
for (const [rel, f] of perFile) {
  for (const [fn, meta] of writeFunctions) {
    if (rel === meta.defRel) continue // definição, não chamador
    const re = new RegExp(`\\b${fn}\\s*\\(`, 'g')
    let m
    while ((m = re.exec(f.text)) !== null) {
      indirect.push({ rel, line: lineOf(f.text, m.index), via: fn, table: meta.table, domain: meta.domain })
    }
  }
}

// ---- Modo report: grafo de autoridade de escrita -> sai 0 ------------------
if (REPORT) {
  console.log(`# authority-guard --report (${TODAY}) — Write Authority Graph`)
  console.log(`# fonte: scanner sobre código vivo | tabelas: ${Object.keys(CRITICAL_TABLES).join(', ')}\n`)
  console.log('## writes diretos  [confidence=confirmed]')
  for (const [rel, f] of [...perFile].sort()) {
    for (const h of f.direct) {
      const auth = originOf(rel) === 'worker' ? 'async' : 'direct'
      console.log(
        `  ${rel}:${h.line}  ${h.table}.${h.op}  origin=${originOf(rel)} authority=${auth} domain=${CRITICAL_TABLES[h.table].domain}  ${isGrandfathered(rel, h.table) ? 'grandfathered' : 'NOVO'}`,
      )
    }
  }
  console.log('\n## RPC de escrita  [authority=rpc-allowed (NÃO trusted)]')
  for (const [rel, f] of [...perFile].sort())
    for (const h of f.rpc) console.log(`  ${rel}:${h.line}  rpc:${h.rpc}  domain=${h.domain}`)
  console.log('\n## writes indiretos nível 1  [confidence=suspected, authority=indirect]')
  for (const h of indirect.sort((a, b) => (a.rel + a.line).localeCompare(b.rel + b.line)))
    console.log(`  ${h.rel}:${h.line}  via ${h.via}() → ${h.table}  domain=${h.domain}`)
  console.log('\n## aliases de client resolvidos  [observabilidade]')
  for (const [rel, f] of [...perFile].sort())
    if (f.aliases.length) console.log(`  ${rel}  aliases=[${f.aliases.join(', ')}]`)
  process.exit(0)
}

// ---- Modo enforcement (independente de inventário, adj. #3) -----------------
const violations = [] // hard-fail
const softNotices = [] // janela transitória datada (não quebra a menos de --strict/expirada)

for (const [rel, f] of perFile) {
  for (const h of f.direct) {
    if (isGrandfathered(rel, h.table)) continue // exceção histórica transitória
    const meta = CRITICAL_TABLES[h.table]
    const msg =
      `${rel}:${h.line} — write direto \`${h.table}.${h.op}(...)\` fora de caminho permitido\n` +
      `      canonical RPC expected (allowed path, NÃO trusted): ${meta.canonicalRpc}\n` +
      `      domínio afetado: ${meta.domain}\n` +
      `      fase de correção: ${meta.phase}`
    if (isSoftNow(h.table)) softNotices.push({ msg, until: TRANSITIONAL_SOFT_UNTIL[h.table] })
    else violations.push(msg)
  }
}

// Entradas de snapshot sem write correspondente → STALE (code-as-truth: prune).
const stale = []
for (const [rel, entry] of Object.entries(GRANDFATHERED)) {
  const found = perFile.get(rel)?.direct ?? []
  for (const table of entry.tables)
    if (!found.some((h) => h.table === table))
      stale.push(`${rel} → ${table} (write não encontrado; prune a entrada do snapshot)`)
}

if (indirect.length > 0) {
  console.warn('[authority-guard] INFO — writes indiretos nível 1 (observabilidade, não bloqueia):')
  for (const h of indirect) console.warn(`  · ${h.rel}:${h.line} via ${h.via}() → ${h.table} [${h.domain}]`)
  console.warn('')
}

if (softNotices.length > 0) {
  console.warn('[authority-guard] WARN — janela soft TRANSITÓRIA (self-expiring):')
  for (const s of softNotices) console.warn(`  - expira em ${s.until}:\n      ${s.msg}`)
  console.warn('  → Fail-soft é temporário. Após a data (ou com --strict) vira hard-fail.\n')
}

if (stale.length > 0) {
  console.warn('[authority-guard] WARN — entradas de snapshot obsoletas (STALE):')
  for (const s of stale) console.warn(`  - ${s}`)
  console.warn('  → O write sumiu: encolha o GRANDFATHERED (subset-only).\n')
}

if (violations.length > 0) {
  console.error('[authority-guard] FAIL — novo write direto em tabela crítica (bypass de caminho permitido):\n')
  for (const v of violations) console.error(`  - ${v}\n`)
  console.error(
    '  → Autoridade = scanner sobre o código. Todo write crítico passa por RPC/worker (allowed path).\n' +
      '    O snapshot histórico NÃO autoriza writes novos — adicionar entrada é bandeira vermelha.\n' +
      '    Prefira rotear pela RPC canônica do domínio.',
  )
  process.exit(1)
}

const n = [...perFile.values()].reduce((a, f) => a + f.direct.length, 0)
console.log(
  `[authority-guard] OK — ${n} write(s) direto(s) crítico(s) no snapshot histórico; ` +
    `${indirect.length} indireto(s) observado(s). Nenhum novo bypass. (code-as-truth)`,
)
