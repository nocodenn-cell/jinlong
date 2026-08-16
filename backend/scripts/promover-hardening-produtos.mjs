#!/usr/bin/env node
/**
 * Promoção SELETIVA das cinco migrations do hardening de produtos.
 *
 * POR QUE EXISTE: `supabase db push` aplicaria também as ~25 migrations do lote
 * de comissões/pagamentos que estão no diretório e fora do tracking remoto —
 * fora do escopo autorizado. E `db push --dry-run` sequer roda (o tracking
 * remoto tem versões sem arquivo local; a CLI sugere reescrever o histórico,
 * o que está vetado). Este script aplica exatamente cinco arquivos, por nome,
 * pela Management API, e recusa qualquer outro.
 *
 * Modos (nenhum aplica nada sem --apply --confirmo-producao):
 *   --check    pré-condições (leitura apenas)
 *   --plan     imprime o que seria aplicado, na ordem, sem executar
 *   --apply    aplica (exige também --confirmo-producao)
 *   --verify   confere o estado pós-deploy
 *
 * Credenciais: SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF no ambiente.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIG_DIR = resolve(AQUI, '../supabase/migrations')

/** Lista FECHADA. Nada fora daqui é aplicado, em nenhum modo. */
const MIGRATIONS = [
  '20260816135000_reconcilia_produtos_codigo_interno.sql',
  '20260816140000_rls_produtos_historico_isolamento_por_loja.sql',
  '20260816141000_criar_produto_autoria_atomica.sql',
  '20260816142000_indices_fks_autoria_produtos.sql',
  '20260816143000_atualizar_produto_com_faixa_atacado.sql',
]

/** Padrões que NUNCA podem aparecer na fila de aplicação. */
const PROIBIDOS = /comiss|commission|pagamento|payment|ap_payments|ar_receipts/i

const args = new Set(process.argv.slice(2))
const MODO = args.has('--apply')
  ? 'apply'
  : args.has('--verify')
    ? 'verify'
    : args.has('--plan')
      ? 'plan'
      : 'check'

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? ''
const PROJECT = process.env.SUPABASE_PROJECT_REF ?? ''

let falhas = 0
function checar(nome, ok, detalhe = '') {
  if (!ok) falhas += 1
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

function lerMigration(nome) {
  if (nome.includes('..') || nome.includes('/') || nome.includes('\\')) {
    throw new Error(`nome de migration inválido: ${nome}`)
  }
  if (PROIBIDOS.test(nome)) {
    throw new Error(`RECUSADO: ${nome} casa com o padrão de comissões/pagamentos`)
  }
  const caminho = join(MIG_DIR, nome)
  if (!existsSync(caminho)) throw new Error(`migration não encontrada: ${caminho}`)
  const sql = readFileSync(caminho, 'utf8')
  if (PROIBIDOS.test(sql)) {
    // Só bloqueia se o SQL tocar objetos de comissão — comentários citando o
    // lote (comuns nestas migrations) não podem barrar a promoção.
    const linhasDDL = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    if (PROIBIDOS.test(linhasDDL)) {
      throw new Error(`RECUSADO: o DDL de ${nome} referencia objetos de comissões/pagamentos`)
    }
  }
  return sql
}

async function api(caminho, opts = {}) {
  if (!TOKEN || !PROJECT) {
    throw new Error('defina SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF')
  }
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}${caminho}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`API ${caminho}: ${r.status} ${texto.slice(0, 300)}`)
  return texto ? JSON.parse(texto) : null
}

const sql = (query) =>
  api('/database/query', { method: 'POST', body: JSON.stringify({ query }) })

async function versoesAplicadas() {
  const r = await sql(
    `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
  )
  return new Set((r ?? []).map((x) => x.version))
}

function versaoDe(nome) {
  return nome.split('_')[0]
}

async function check() {
  console.log('=== Pré-condições ===')
  const aplicadas = await versoesAplicadas()

  for (const m of MIGRATIONS) {
    lerMigration(m) // valida nome/conteúdo
    checar(`${versaoDe(m)} ainda NÃO aplicada`, !aplicadas.has(versaoDe(m)))
  }

  const r = await sql(`
    SELECT
      (SELECT pg_get_function_result(oid) FROM pg_proc WHERE proname='list_produtos_gerente_filtrados' LIMIT 1) AS ret,
      (SELECT numeric_precision || ',' || numeric_scale FROM information_schema.columns
        WHERE table_name='produtos' AND column_name='preco_custo_medio') AS precisao,
      (SELECT count(*) FROM pg_policies WHERE tablename='produtos' AND policyname IN ('caixa_policy','painel_policy')) AS orfas
  `)
  const est = r?.[0] ?? {}
  const nCols = (String(est.ret ?? '').match(/,/g) ?? []).length + 1
  checar('RPC de listagem ainda com 17 colunas (estado pré-deploy esperado)', nCols === 17, `cols=${nCols}`)
  checar('preco_custo_medio é 10,2 em produção', est.precisao === '10,2', `precisao=${est.precisao}`)
  checar('policies órfãs ainda presentes (serão removidas pela #2)', Number(est.orfas) === 2, `orfas=${est.orfas}`)

  console.log(
    falhas === 0
      ? '\nPré-condições OK. Rode --plan para ver a fila.'
      : `\n${falhas} pré-condição(ões) não conferem — NÃO prosseguir.`,
  )
  return falhas === 0
}

function plan() {
  console.log('=== Fila de promoção (nada será executado) ===')
  MIGRATIONS.forEach((m, i) => {
    const sqlTexto = lerMigration(m)
    const linhas = sqlTexto.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--')).length
    console.log(`${i + 1}. ${m}`)
    console.log(`   versão=${versaoDe(m)}  linhas de DDL=${linhas}`)
  })
  console.log(`\nTotal: ${MIGRATIONS.length} migrations. Nenhuma outra será tocada.`)
  console.log('Para aplicar: --apply --confirmo-producao')
}

async function apply() {
  if (!args.has('--confirmo-producao')) {
    console.error('RECUSADO: --apply exige também --confirmo-producao')
    process.exit(2)
  }
  if (!(await check())) {
    console.error('RECUSADO: pré-condições não conferem.')
    process.exit(1)
  }
  console.log('\n=== Aplicando ===')
  for (const m of MIGRATIONS) {
    const corpo = lerMigration(m)
    process.stdout.write(`aplicando ${m} ... `)
    await api('/database/migrations', {
      method: 'POST',
      body: JSON.stringify({ name: m.replace(/^\d+_/, '').replace(/\.sql$/, ''), query: corpo }),
    })
    console.log('OK')
  }
  console.log('\nAplicadas. Rode --verify.')
}

async function verify() {
  console.log('=== Verificação pós-deploy ===')
  const r = await sql(`
    SELECT
      (SELECT pg_get_function_result(oid) FROM pg_proc WHERE proname='list_produtos_gerente_filtrados' LIMIT 1) AS ret,
      (SELECT prosecdef FROM pg_proc WHERE proname='list_produtos_gerente_filtrados' LIMIT 1) AS secdef,
      (SELECT numeric_precision || ',' || numeric_scale FROM information_schema.columns
        WHERE table_name='produtos' AND column_name='preco_custo_medio') AS precisao,
      (SELECT count(*) FROM pg_policies WHERE tablename='produtos' AND policyname IN ('caixa_policy','painel_policy')) AS orfas,
      (SELECT count(*) FROM pg_indexes WHERE indexname IN
        ('idx_produtos_criado_por','idx_produtos_atualizado_por','idx_historico_precos_produto_alterado_por')) AS indices,
      (SELECT count(*) FROM pg_proc WHERE proname='atualizar_produto_com_faixa_atacado') AS rpc_faixa
  `)
  const e = r?.[0] ?? {}
  const nCols = (String(e.ret ?? '').match(/,/g) ?? []).length + 1
  checar('RPC de listagem com 17 colunas', nCols === 17, `cols=${nCols}`)
  checar('RPC de listagem é SECURITY INVOKER', e.secdef === false, `secdef=${e.secdef}`)
  checar('preco_custo_medio 10,2', e.precisao === '10,2')
  checar('policies órfãs removidas', Number(e.orfas) === 0, `orfas=${e.orfas}`)
  checar('3 índices de autoria', Number(e.indices) === 3, `indices=${e.indices}`)
  checar('RPC transacional presente', Number(e.rpc_faixa) === 1)

  const aplicadas = await versoesAplicadas()
  for (const m of MIGRATIONS) {
    checar(`${versaoDe(m)} registrada no tracking`, aplicadas.has(versaoDe(m)))
  }
  console.log(falhas === 0 ? '\nTudo conferido.' : `\n${falhas} verificação(ões) falharam.`)
  return falhas === 0
}

const acoes = { check, plan, apply, verify }
Promise.resolve(acoes[MODO]())
  .then((ok) => process.exit(ok === false || falhas > 0 ? 1 : 0))
  .catch((e) => {
    console.error('ERRO:', e.message)
    process.exit(1)
  })
