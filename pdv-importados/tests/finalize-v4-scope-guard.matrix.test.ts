/**
 * Contrato estático: guard de escopo da finalizar_venda v4 (migration 289).
 *
 * Garante que a correção não seja anulada por ordem lexical (como o PR #187
 * com timestamp 20260714*, anterior a 274_*) nem por assinatura pré-272.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '../backend/supabase/migrations')
const GUARD = '20260809120100_finalize_v4_scope_guard.sql'
const BODY_RECREATE = '274_bl2_promocao_rpc_e_precedencia.sql'

describe('finalize v4 scope guard (migration 289)', () => {
  it('migration 289 existe e ordena depois da recriação 274', () => {
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files).toContain(GUARD)
    expect(files).toContain(BODY_RECREATE)
    expect(files.indexOf(GUARD)).toBeGreaterThan(files.indexOf(BODY_RECREATE))
  })

  it('wrapper valida loja/caixa/operador e usa assinatura 21 args', () => {
    const src = fs.readFileSync(path.join(MIGRATIONS, GUARD), 'utf8')
    expect(src).toContain('finalizar_venda_transacional_canonica_v4_unscoped')
    expect(src).toContain('FINALIZAR_VENDA_CANONICA_LOJA_INVALIDA')
    expect(src).toContain('FINALIZAR_VENDA_CANONICA_CAIXA_LOJA_INVALIDA')
    expect(src).toContain('FINALIZAR_VENDA_CANONICA_CAIXA_OPERADOR_INVALIDO')
    expect(src).toContain('FINALIZAR_VENDA_CANONICA_OPERADOR_INVALIDO')
    expect(src).toContain('p_motivo_desconto')
    expect(src).toContain('p_motivo_descricao')
    expect(src).toContain('motivo_desconto_enum_tipo')
    expect(src).toMatch(/REVOKE ALL ON FUNCTION public\.finalizar_venda_transacional_canonica_v4_unscoped/)
  })
})
