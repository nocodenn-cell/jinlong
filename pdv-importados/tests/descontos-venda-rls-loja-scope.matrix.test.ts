/**
 * Contrato estático: RLS de descontos_venda isola por loja do caixa da venda.
 *
 * Evita regressão ao padrão role-only (008/044/224) que permitia GERENTE da
 * Loja A ler/alterar descontos da Loja B via PostgREST / auditoria DESCONTO.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '../backend/supabase/migrations')
const GUARD = '20260811110000_descontos_venda_rls_loja_scope.sql'
const LEGACY_ROLE_ONLY = [
  '008_descontos_venda_rls.sql',
  '044_usuario_perfil_admin_rls.sql',
]

describe('descontos_venda RLS loja scope', () => {
  it('migration existe e ordena depois das policies role-only legadas', () => {
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files).toContain(GUARD)
    const guardIdx = files.indexOf(GUARD)
    for (const legacy of LEGACY_ROLE_ONLY) {
      expect(files).toContain(legacy)
      expect(guardIdx).toBeGreaterThan(files.indexOf(legacy))
    }
  })

  it('policies amarram venda→caixa.loja_id e restringem GERENTE à própria loja', () => {
    const src = fs.readFileSync(path.join(MIGRATIONS, GUARD), 'utf8')
    expect(src).toContain('descontos_venda_select_gerente_dono')
    expect(src).toContain('descontos_venda_insert_gerente_dono')
    expect(src).toContain('descontos_venda_update_gerente_dono')
    expect(src).toContain('descontos_venda_delete_gerente_dono')
    expect(src).toContain('JOIN public.caixas c ON c.id = v.caixa_id')
    expect(src).toContain('u.loja_id = c.loja_id')
    expect(src).toMatch(/u\.perfil = ANY \(ARRAY\['DONO'::text, 'ADMIN'::text\]\)/)
    expect(src).toContain('(SELECT auth.uid())')
  })
})
