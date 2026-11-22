#!/usr/bin/env node
/**
 * Benchmark sintético LOCAL (PGlite) — isolamento multi-loja e latência básica.
 * NÃO prova capacidade multiempresa (não há tabela empresas).
 * NÃO declara SLA de produção.
 *
 * Uso: node scripts/benchmarks/multitenant-load-synth.mjs
 * Env: BENCH_LOJAS=2|10|20 (default 2), BENCH_PRODUTOS_POR_LOJA=100, BENCH_ROUNDS=50
 */
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const LOJAS = Math.max(1, Number(process.env.BENCH_LOJAS || 2))
const PRODUTOS = Math.max(1, Number(process.env.BENCH_PRODUTOS_POR_LOJA || 100))
const ROUNDS = Math.max(10, Number(process.env.BENCH_ROUNDS || 50))

function pct(sorted, p) {
  if (sorted.length === 0) return null
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[i]
}

function stats(samplesMs) {
  const s = [...samplesMs].sort((a, b) => a - b)
  return {
    n: s.length,
    p50: pct(s, 50),
    p95: pct(s, 95),
    p99: pct(s, 99),
    max: s[s.length - 1],
  }
}

async function main() {
  const db = await PGlite.create()
  await db.exec(`
    CREATE TABLE lojas (id uuid PRIMARY KEY, codigo text UNIQUE NOT NULL);
    CREATE TABLE produtos (
      id uuid PRIMARY KEY,
      loja_id uuid NOT NULL REFERENCES lojas(id),
      codigo_barras text NOT NULL,
      nome text NOT NULL,
      preco numeric NOT NULL,
      UNIQUE (loja_id, codigo_barras)
    );
    CREATE INDEX produtos_loja_idx ON produtos(loja_id);
  `)

  const lojaIds = []
  for (let i = 0; i < LOJAS; i += 1) {
    const id = randomUUID()
    lojaIds.push(id)
    await db.query('INSERT INTO lojas(id, codigo) VALUES ($1, $2)', [id, `L${i}`])
    for (let p = 0; p < PRODUTOS; p += 1) {
      await db.query(
        'INSERT INTO produtos(id, loja_id, codigo_barras, nome, preco) VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), id, `789${i}${String(p).padStart(8, '0')}`, `P${p}`, 10 + (p % 7)],
      )
    }
  }

  const target = lojaIds[0]
  const foreign = lojaIds[Math.min(1, lojaIds.length - 1)]
  const foreignProduct = (
    await db.query('SELECT id FROM produtos WHERE loja_id = $1 LIMIT 1', [foreign])
  ).rows[0]

  const listMs = []
  const byIdMs = []
  let crossHits = 0

  for (let r = 0; r < ROUNDS; r += 1) {
    const t0 = performance.now()
    const listed = await db.query(
      'SELECT id FROM produtos WHERE loja_id = $1 ORDER BY nome LIMIT 50',
      [target],
    )
    listMs.push(performance.now() - t0)
    if (listed.rows.some((row) => row.id === foreignProduct?.id)) crossHits += 1

    const t1 = performance.now()
    const byId = await db.query(
      'SELECT id FROM produtos WHERE id = $1 AND loja_id = $2',
      [foreignProduct.id, target],
    )
    byIdMs.push(performance.now() - t1)
    if (byId.rows.length > 0) crossHits += 1
  }

  const report = {
    generated_at: new Date().toISOString(),
    engine: 'pglite',
    hypothesis: {
      lojas: LOJAS,
      produtos_por_loja: PRODUTOS,
      rounds: ROUNDS,
      note: 'Sem RLS/auth; mede filtro loja_id e latência in-process. Não é capacidade SaaS.',
    },
    latency_ms: {
      list_produtos_loja: stats(listMs),
      get_by_id_scoped: stats(byIdMs),
    },
    isolation: {
      cross_loja_hits: crossHits,
      pass: crossHits === 0,
    },
  }

  const outDir = '/opt/cursor/artifacts'
  try {
    mkdirSync(outDir, { recursive: true })
  } catch {
    /* ignore */
  }
  const outPath = path.join(outDir, `multitenant-bench-lojas${LOJAS}.json`)
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  console.log(`WROTE ${outPath}`)
  await db.close()
  if (!report.isolation.pass) process.exit(1)
}

main().catch((err) => {
  console.error(String(err?.stack || err))
  process.exit(1)
})
