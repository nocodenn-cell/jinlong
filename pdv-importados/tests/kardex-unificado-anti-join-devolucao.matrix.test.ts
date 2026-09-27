/**
 * Contrato estático: v_kardex_unificado não duplica devolução pós-#313.
 *
 * 20260821110000 restaurou INSERT em movimentos_estoque_log; a view 291
 * ainda fazia UNION ALL com estoque_reposicoes_devolucao sem anti-join.
 * Canônico: 20260828110000.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '../backend/supabase/migrations')
const LEGACY = '20260805185445_291_estoque_baixas_integridade.sql'
const WRITE_SIDE = '20260821110000_restore_devolver_ou_trocar_venda_kardex_ssot04.sql'
const FIX = '20260828110000_fix_v_kardex_unificado_anti_join_devolucao.sql'
const CREATE_VIEW_RE = /CREATE(?: OR REPLACE)? VIEW public\.v_kardex_unificado/i

function latestKardexViewMigration(): string {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  const hits = files.filter((f) => CREATE_VIEW_RE.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')))
  if (hits.length === 0) {
    throw new Error('nenhuma migration define v_kardex_unificado')
  }
  return hits[hits.length - 1]
}

function erdUnionBranch(sql: string): string {
  const parts = sql.split(/UNION ALL/i)
  const erd = parts.find((p) => /FROM\s+estoque_reposicoes_devolucao\b/i.test(p))
  if (!erd) {
    throw new Error('ramo estoque_reposicoes_devolucao ausente na view')
  }
  return erd
}

describe('v_kardex_unificado anti-join devolução', () => {
  it('migration corretiva existe e ordena depois do restore SSOT-04', () => {
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files).toContain(LEGACY)
    expect(files).toContain(WRITE_SIDE)
    expect(files).toContain(FIX)
    expect(files.indexOf(FIX)).toBeGreaterThan(files.indexOf(WRITE_SIDE))
  })

  it('a definição vigente da view não está antes da migration corretiva', () => {
    // Não trava na definição literal do arquivo FIX: uma migration posterior
    // (ex.: T5, 20260927130000) pode redefinir a view de novo, desde que
    // preserve as garantias abaixo — verificadas contra o arquivo vigente,
    // não contra este hardcoded.
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files.indexOf(latestKardexViewMigration())).toBeGreaterThanOrEqual(files.indexOf(FIX))
  })

  it('ramo erd omite linhas já lançadas em movimentos_estoque_log', () => {
    const src = fs.readFileSync(path.join(MIGRATIONS, latestKardexViewMigration()), 'utf8')
    const erd = erdUnionBranch(src)
    expect(erd).toMatch(/NOT EXISTS/i)
    expect(erd).toContain("mel.tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE'")
    expect(erd).toContain('erd.operacao_id::text')
    expect(erd).toContain('mel.observacao')
    expect(src).not.toMatch(/DROP VIEW[\s\S]*v_kardex_unificado/)
  })

  it('preserva anti-join de baixas (DAT-01) e o fallback erd para legado', () => {
    const src = fs.readFileSync(path.join(MIGRATIONS, latestKardexViewMigration()), 'utf8')
    expect(src).toContain('NULLIF(eb.quantidade, 0)')
    expect(src).toContain("mel.tipo_codigo = 'SAIDA_VENDA'")
    expect(src).toContain('estoque_reposicoes_devolucao')
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
