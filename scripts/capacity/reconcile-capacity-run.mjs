#!/usr/bin/env node
/**
 * CAP-02 — baseline/reconciliação por cenário (somente DB local 127.0.0.1:54422).
 *   CAP02_MODE=baseline → grava snapshot de estoque/caixa
 *   CAP02_MODE=check    → compara snapshot com vendas da janela
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const scenario = (process.env.CAP02_SCENARIO || 'T00').toLowerCase()
const mode = process.env.CAP02_MODE || 'check'
const since = process.env.CAP02_SINCE
const until = process.env.CAP02_UNTIL
const dbUrl =
  process.env.CAPACITY_DB_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres'
const ART = '/opt/cursor/artifacts'
const baselinePath = `${ART}/cap02-${scenario}-baseline.json`
const reportPath = `${ART}/cap02-${scenario}-reconcile.json`

const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
for (const ts of [since, until]) {
  if (ts && !ISO_TS.test(ts)) {
    console.error(`RECUSADO: timestamp inválido: ${ts}`)
    process.exit(2)
  }
}

if (!/127\.0\.0\.1:54422/.test(dbUrl) || /supabase\.co/.test(dbUrl)) {
  console.error('RECUSADO: DB não é a stack capacity local')
  process.exit(2)
}

function rows(sql) {
  const oneLine = String(sql).replace(/\s+/g, ' ').trim()
  const out = execSync(
    `psql "${dbUrl}" -v ON_ERROR_STOP=1 -tAc ${JSON.stringify(
      `SELECT coalesce(json_agg(t),'[]'::json) FROM (${oneLine}) t`,
    )}`,
    { encoding: 'utf8' },
  ).trim()
  return JSON.parse(out || '[]')
}

function scalar(sql) {
  const r = rows(sql)
  return r.length ? Object.values(r[0])[0] : null
}

function snapshot() {
  return {
    taken_at: new Date().toISOString(),
    estoque: rows(`SELECT produto_id, loja_id, quantidade_atual::numeric AS q FROM public.estoque`),
    caixas: rows(`SELECT id, loja_id, saldo_atual::numeric AS saldo FROM public.caixas WHERE status='ABERTO'`),
    mov_fin: Number(scalar(`SELECT count(*) AS n FROM public.movimentos_financeiros`)),
  }
}

function key(p, l) {
  return `${p}|${l}`
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) return null
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
}

function absoluteChecks(win) {
  const kardexDivergente = Number(scalar(`
    SELECT count(*) AS n FROM public.vendas v
    JOIN public.caixas c ON c.id=v.caixa_id
    JOIN public.itens_venda i ON i.venda_id=v.id
    WHERE ${win} AND (SELECT coalesce(sum(m.quantidade_delta),0) FROM public.movimentos_estoque_log m
      WHERE m.venda_id=v.id AND m.produto_id=i.produto_id AND m.loja_id=c.loja_id
        AND m.tipo_codigo='SAIDA_VENDA') <> -i.quantidade`))
  const caixaAbsDivergente = Number(scalar(`
    SELECT count(*) AS n FROM (
      SELECT c.id, c.valor_inicial + coalesce(sum(p.valor),0) - c.saldo_atual AS diff
      FROM public.caixas c
      LEFT JOIN public.vendas v ON v.caixa_id=c.id AND v.status='CONCLUIDA'
      LEFT JOIN public.vendas_pagamentos p ON p.venda_id=v.id AND p.forma_pagamento='DINHEIRO'
      WHERE c.status='ABERTO' GROUP BY c.id) d WHERE abs(d.diff) > 0.009`))
  const duplicadas = Number(scalar(`
    SELECT count(*) AS n FROM (SELECT i.venda_id FROM public.vendas v
      JOIN public.itens_venda i ON i.venda_id=v.id WHERE ${win}
      GROUP BY i.venda_id, i.produto_id HAVING count(*) > 1) d`))
  return { kardexDivergente, caixaAbsDivergente, duplicadas }
}

function check() {
  if (!since) throw new Error('CAP02_SINCE ausente')
  const base = loadBaseline()
  const upper = until ? ` AND v.data < '${until}'::timestamptz` : ''
  const win = `v.data >= '${since}'::timestamptz${upper} AND v.status='CONCLUIDA'`
  const abs = absoluteChecks(win)

  const vendas = Number(scalar(`SELECT count(*) AS n FROM public.vendas v WHERE ${win}`))
  const porLoja = rows(`
    SELECT l.codigo, count(*)::int AS vendas, sum(v.total_liquido)::numeric AS total
    FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id
    JOIN public.lojas l ON l.id=c.loja_id
    WHERE ${win} GROUP BY l.codigo ORDER BY l.codigo`)
  const semItens = Number(scalar(`
    SELECT count(*) AS n FROM public.vendas v WHERE ${win}
      AND NOT EXISTS (SELECT 1 FROM public.itens_venda i WHERE i.venda_id=v.id)`))
  const pagDivergente = Number(scalar(`
    SELECT count(*) AS n FROM public.vendas v WHERE ${win}
      AND v.total_liquido <> coalesce((SELECT sum(p.valor) FROM public.vendas_pagamentos p
                                       WHERE p.venda_id=v.id), v.total_liquido)`))
  const operadorForaDaLoja = Number(scalar(`
    SELECT count(*) AS n FROM public.vendas v
    JOIN public.caixas c ON c.id=v.caixa_id
    JOIN public.usuarios u ON u.id=v.operador_id
    WHERE ${win} AND (u.loja_id <> c.loja_id OR v.operador_id <> c.operador_id)`))
  const itemProdutoOutraLoja = Number(scalar(`
    SELECT count(*) AS n FROM public.vendas v
    JOIN public.caixas c ON c.id=v.caixa_id
    JOIN public.itens_venda i ON i.venda_id=v.id
    JOIN public.produtos p ON p.id=i.produto_id
    WHERE ${win} AND p.loja_id <> c.loja_id`))

  const viaBase = base ? baselineChecks(win, base) : null
  const negativo = Number(scalar(`SELECT count(*) AS n FROM public.estoque WHERE quantidade_atual < 0`))

  const report = {
    scenario: scenario.toUpperCase(),
    since,
    until: until || null,
    baseline: base ? base.taken_at : null,
    vendas_persistidas: vendas,
    vendas_por_loja: porLoja,
    vendas_sem_itens: semItens,
    itens_duplicados: abs.duplicadas,
    pagamentos_divergentes: pagDivergente,
    kardex_divergencias: abs.kardexDivergente,
    estoque_negativo: negativo,
    caixa_saldo_abs_divergencias: abs.caixaAbsDivergente,
    estoque_vs_baseline_divergencias: viaBase ? viaBase.estoqueDiv.length : null,
    caixa_vs_baseline_divergencias: viaBase ? viaBase.caixaDiv.length : null,
    caixa_div_amostra: viaBase ? viaBase.caixaDiv.slice(0, 5) : [],
    movimentos_financeiros_delta: viaBase ? viaBase.movFinDelta : null,
    isolamento_operador_fora_da_loja: operadorForaDaLoja,
    isolamento_produto_outra_loja: itemProdutoOutraLoja,
    pg_conexoes: Number(scalar(`SELECT count(*) AS n FROM pg_stat_activity WHERE datname='postgres'`)),
    locks_aguardando: Number(scalar(`SELECT count(*) AS n FROM pg_locks WHERE NOT granted`)),
  }
  const zeros = [
    semItens, abs.duplicadas, pagDivergente, abs.kardexDivergente, negativo,
    abs.caixaAbsDivergente, operadorForaDaLoja, itemProdutoOutraLoja,
    viaBase ? viaBase.estoqueDiv.length : 0, viaBase ? viaBase.caixaDiv.length : 0,
  ]
  report.ok = zeros.every((n) => n === 0)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

function baselineChecks(win, base) {
  const vendido = rows(`
    SELECT i.produto_id, c.loja_id, sum(i.quantidade)::numeric AS q
    FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id
    JOIN public.itens_venda i ON i.venda_id=v.id
    WHERE ${win} GROUP BY i.produto_id, c.loja_id`)
  const atual = snapshot()
  const atualEstoque = new Map(atual.estoque.map((e) => [key(e.produto_id, e.loja_id), Number(e.q)]))
  const baseEstoque = new Map(base.estoque.map((e) => [key(e.produto_id, e.loja_id), Number(e.q)]))
  const estoqueDiv = vendido
    .map((v) => {
      const k = key(v.produto_id, v.loja_id)
      return { k, esperado: (baseEstoque.get(k) ?? 0) - Number(v.q), atual: atualEstoque.get(k) }
    })
    .filter((d) => Math.abs(d.esperado - d.atual) > 0.0001)

  const caixaVendido = rows(`
    SELECT v.caixa_id, sum(p.valor)::numeric AS dinheiro
    FROM public.vendas v JOIN public.vendas_pagamentos p ON p.venda_id=v.id
    WHERE ${win} AND p.forma_pagamento='DINHEIRO' GROUP BY v.caixa_id`)
  const caixaAtual = new Map(atual.caixas.map((c) => [c.id, Number(c.saldo)]))
  const caixaBase = new Map(base.caixas.map((c) => [c.id, Number(c.saldo)]))
  const caixaDiv = caixaVendido
    .map((c) => ({
      caixa_id: c.caixa_id,
      esperado: (caixaBase.get(c.caixa_id) ?? 0) + Number(c.dinheiro),
      atual: caixaAtual.get(c.caixa_id),
    }))
    .filter((d) => Math.abs(d.esperado - d.atual) > 0.009)
  return { estoqueDiv, caixaDiv, movFinDelta: atual.mov_fin - base.mov_fin }
}

if (mode === 'baseline') {
  fs.writeFileSync(baselinePath, JSON.stringify(snapshot()))
  console.log(`baseline ok → ${baselinePath}`)
} else {
  check()
}
