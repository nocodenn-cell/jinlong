/**
 * Contrato estático: desconto comercial do operador ≤10% sem token de gerente.
 * Falha se a migration perder a função helper ou os patches no wrapper/unscoped.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '../backend/supabase/migrations')
const MIGRATION = '20261006190000_desconto_comercial_operador_dinheiro.sql'
const HELPER = 'desconto_comercial_operador_ok'

describe('desconto comercial operador ≤10% sem gerente (invariante de banco)', () => {
  const src = fs.readFileSync(path.join(MIGRATIONS, MIGRATION), 'utf8')

  it('migration existe e cria o helper interno', () => {
    expect(fs.readdirSync(MIGRATIONS)).toContain(MIGRATION)
    expect(src).toContain(`internal.${HELPER}`)
    expect(src).toContain("p_motivo = 'AUTORIZACAO_COMERCIAL'")
    expect(src).toContain('p_percentual <= 10')
    expect(src).toContain('p_token IS NULL')
  })

  it('patcha wrapper e unscoped para aceitar comercial sem token', () => {
    expect(src).toContain('finalizar_venda_transacional_canonica_v4(')
    expect(src).toContain('finalizar_venda_transacional_canonica_v4_unscoped(')
    expect(src).toContain(`NOT internal.${HELPER}`)
    expect(src).toContain('INSERT INTO public.descontos_venda')
  })

  it('helper sem EXECUTE para anon/authenticated', () => {
    expect(src).toMatch(
      new RegExp(`REVOKE ALL ON FUNCTION internal\\.${HELPER}\\([^)]+\\)\\s+FROM PUBLIC, anon, authenticated`),
    )
  })
})
