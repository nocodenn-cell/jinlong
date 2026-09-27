/**
 * Contrato estático: v_kardex_unificado não duplica o estorno de
 * cancelamento de venda.
 *
 * cancelar_venda_transacional (20260909200000) grava, para o mesmo evento
 * físico de reposição de estoque, duas linhas: estoque_reposicoes_cancelamento
 * (idempotência) e movimentos_estoque_log (tipo_codigo=ENTRADA_DEVOLUCAO_CLIENTE).
 * A view (canônica até 20260828110000) fazia UNION ALL dos dois ramos (mel: e
 * erc:) sem anti-join entre eles — a própria 20260828110000 documentava isso
 * como dívida pré-janela ("ramo estoque_reposicoes_cancelamento ainda sem
 * anti-join"). Canônico: 20260927130000 (T5, auditoria 2026-09-27).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '../backend/supabase/migrations')
const PREVIOUS = '20260828110000_fix_v_kardex_unificado_anti_join_devolucao.sql'
const FIX = '20260927130000_t5_fix_v_kardex_unificado_anti_join_cancelamento.sql'
const CREATE_VIEW_RE = /CREATE(?: OR REPLACE)? VIEW public\.v_kardex_unificado/i

function latestKardexViewMigration(): string {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  const hits = files.filter((f) => CREATE_VIEW_RE.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')))
  if (hits.length === 0) {
    throw new Error('nenhuma migration define v_kardex_unificado')
  }
  return hits[hits.length - 1]
}

function ercUnionBranch(sql: string): string {
  const parts = sql.split(/UNION ALL/i)
  const erc = parts.find((p) => /FROM\s+estoque_reposicoes_cancelamento\b/i.test(p))
  if (!erc) {
    throw new Error('ramo estoque_reposicoes_cancelamento ausente na view')
  }
  return erc
}

describe('v_kardex_unificado anti-join cancelamento (T5)', () => {
  it('migration corretiva existe e ordena depois da correção de devolução', () => {
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files).toContain(PREVIOUS)
    expect(files).toContain(FIX)
    expect(files.indexOf(FIX)).toBeGreaterThan(files.indexOf(PREVIOUS))
  })

  it('a definição vigente da view não está antes da migration corretiva T5', () => {
    // Não trava na definição literal do arquivo FIX: uma migration posterior
    // pode redefinir a view de novo, desde que preserve as garantias abaixo
    // — verificadas contra o arquivo vigente, não contra este hardcoded.
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files.indexOf(latestKardexViewMigration())).toBeGreaterThanOrEqual(files.indexOf(FIX))
  })

  it('ramo erc omite linhas já lançadas em movimentos_estoque_log', () => {
    const src = fs.readFileSync(path.join(MIGRATIONS, latestKardexViewMigration()), 'utf8')
    const erc = ercUnionBranch(src)
    expect(erc).toMatch(/NOT EXISTS/i)
    expect(erc).toContain("mel.tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE'")
    expect(erc).toContain('mel.venda_id = erc.venda_id')
    expect(erc).toContain('mel.produto_id = erc.produto_id')
    expect(src).not.toMatch(/DROP VIEW[\s\S]*v_kardex_unificado/)
  })

  it('preserva os anti-joins pré-existentes (SAIDA_VENDA e devolução parcial erd)', () => {
    const src = fs.readFileSync(path.join(MIGRATIONS, latestKardexViewMigration()), 'utf8')
    expect(src).toContain('NULLIF(eb.quantidade, 0)')
    expect(src).toContain("mel.tipo_codigo = 'SAIDA_VENDA'")
    expect(src).toContain('estoque_reposicoes_devolucao')
    expect(src).toContain('erd.operacao_id::text')
    expect(src).toContain('CREATE OR REPLACE VIEW public.v_kardex_unificado')
  })

  it('reader do admin continua na view canônica, não no log cru', () => {
    const reader = fs.readFileSync(
      path.resolve(ROOT, 'app/admin/estoque/inventoryMovementReader.ts'),
      'utf8',
    )
    expect(reader).toContain("from('v_kardex_unificado')")
    expect(reader).not.toMatch(/\.from\(['"]movimentos_estoque_log['"]\)/)
  })
})
