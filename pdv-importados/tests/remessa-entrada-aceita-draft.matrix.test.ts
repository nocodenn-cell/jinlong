/**
 * Contrato estático: recebimento aceita DRAFT e bloqueia INATIVO.
 *
 * D0-03 (`20260823192024`) checava `p.ativo`, que só é true em PUBLICADO —
 * todo produto novo (DRAFT) falhava com REMESSA_ITEM_INVALIDO na confirmação,
 * apesar de `buscarProdutosRecebimento` já devolver DRAFT de propósito.
 * Canônico em main: `20260824120000` (#324), não o timestamp da #325.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '../backend/supabase/migrations')
const ACTIONS = path.resolve(ROOT, 'app/gerente/recebimento/actions.ts')
const LEGACY = '20260823192024_d0_remessa_quantidade_positiva_atomica.sql'
const FIX = '20260824120000_fix_remessa_entrada_aceita_produto_draft.sql'

describe('remessa entrada aceita DRAFT', () => {
  it('migration corretiva existe e ordena depois da D0-03', () => {
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    expect(files).toContain(LEGACY)
    expect(files).toContain(FIX)
    expect(files.indexOf(FIX)).toBeGreaterThan(files.indexOf(LEGACY))
  })

  it('RPC vigente não usa p.ativo e bloqueia só INATIVO', () => {
    const src = fs.readFileSync(path.join(MIGRATIONS, FIX), 'utf8')
    expect(src).toContain("status_publicacao IS DISTINCT FROM 'INATIVO'")
    expect(src).not.toMatch(/p\.loja_id = v_loja AND p\.ativo/)
    expect(src).toContain('CREATE OR REPLACE FUNCTION public.criar_confirmar_remessa_entrada')
    expect(src).not.toMatch(/DROP FUNCTION[\s\S]*criar_confirmar_remessa_entrada/)
  })

  it('busca do fluxo continua aceitando DRAFT e excluindo INATIVO', () => {
    const src = fs.readFileSync(ACTIONS, 'utf8')
    expect(src).toContain('isInativo')
    expect(src).toContain('DRAFT é aceito de propósito')
    expect(src).not.toMatch(/\.eq\(['"]ativo['"],\s*true\)/)
  })
})
