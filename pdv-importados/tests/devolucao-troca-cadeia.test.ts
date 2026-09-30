/**
 * Cadeia de devolução/troca pós-venda — UI → action → impl → RPC.
 *
 * Por que: vários documentos ainda classificam devolução/troca como pendência P1,
 * citando `048_devolucoes.sql` como incompleto. Esse snapshot é de 2026-07-10 e não
 * conhece `20260717031500_248_devolver_ou_trocar_venda.sql` (2026-07-17), que está
 * aplicada em produção e implementa a "RPC única" pedida.
 *
 * Os testes existentes (`p0-venda-homologacao`, `p0-roteiro-operacional`) só verificam
 * que o arquivo impl existe. Este aqui prende a cadeia inteira: se alguém quebrar o elo
 * entre a UI e a RPC, o CI falha em vez de a pendência reaparecer como boato.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '../backend/supabase/migrations')
const MIGRATION = '20260717031500_248_devolver_ou_trocar_venda.sql'
const RPC = 'devolver_ou_trocar_venda'
const CREATE_RPC_RE = /CREATE(?: OR REPLACE)? FUNCTION public\.devolver_ou_trocar_venda\s*\(/i

const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8')

function latestDevolverRpcMigration(): string {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  const hits = files.filter((f) => CREATE_RPC_RE.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')))
  if (hits.length === 0) {
    throw new Error('nenhuma migration define devolver_ou_trocar_venda')
  }
  return hits[hits.length - 1]
}

describe('cadeia devolução/troca', () => {
  it('a migration que define a RPC única existe', () => {
    expect(fs.existsSync(path.join(MIGRATIONS, MIGRATION))).toBe(true)
  })

  it('a RPC cobre estoque, devoluções, caixa/AR, kardex e ledger numa rotina só', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, MIGRATION), 'utf8')
    expect(sql).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${RPC}\\(`))
    // O COMMENT é o contrato declarado da rotina única — se ele sumir, a promessa sumiu.
    expect(sql).toMatch(/COMMENT ON FUNCTION public\.devolver_ou_trocar_venda/)
    expect(sql).toMatch(/Idempotente/i)
  })

  it('a RPC não é executável por PUBLIC e concede EXECUTE explicitamente', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, MIGRATION), 'utf8')
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${RPC}\\([^)]*\\)\\s*FROM PUBLIC`))
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.devolver_ou_trocar_venda\([^)]*\)\s*TO authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.devolver_ou_trocar_venda\([^)]*\)\s*TO service_role/)
  })

  it('a impl chama exatamente essa RPC', () => {
    expect(read('app/gerente/vendas/devolverOuTrocarVenda.impl.ts')).toContain(`supabase.rpc('${RPC}'`)
  })

  it('a server action delega para a impl', () => {
    const actions = read('app/gerente/vendas/actions.ts')
    expect(actions).toContain('devolverOuTrocarVendaImpl')
    expect(actions).toContain('export async function devolverOuTrocarVendaAction')
  })

  it('a UI dispara a action', () => {
    expect(read('app/gerente/vendas/VendaDevolucaoModal.tsx')).toContain('devolverOuTrocarVendaAction')
  })

  it('a superfície admin expõe a entrada de devolução', () => {
    expect(read('app/admin/vendas/_components/VendaDetailSheet.tsx')).toMatch(/devolver/i)
  })

  it('a definição vigente da RPC grava kardex em movimentos_estoque_log', () => {
    const latest = latestDevolverRpcMigration()
    expect(latest >= '20260821110000').toBe(true)
    const sql = fs.readFileSync(path.join(MIGRATIONS, latest), 'utf8')
    expect(sql).toMatch(/INSERT INTO public\.movimentos_estoque_log/)
    expect(sql).toMatch(/'ENTRADA_DEVOLUCAO_CLIENTE'/)
    expect(sql).toMatch(/itens jsonb/)
    // Um DROP só é aceitável quando a assinatura MUDA (novo parâmetro criaria overload ambíguo). Nesse caso a mesma
    // migration precisa recriar a função, reaplicar as permissões e provar que não sobrou overload (PR-2D).
    if (/DROP FUNCTION IF EXISTS public\.devolver_ou_trocar_venda/.test(sql)) {
      expect(sql).toMatch(/CREATE FUNCTION public\.devolver_ou_trocar_venda\s*\(/)
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.devolver_ou_trocar_venda\([^)]*\)\s*TO authenticated/)
      expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.devolver_ou_trocar_venda\([^)]*\)\s*FROM PUBLIC, anon/)
      expect(sql).toMatch(/overload de devolver_ou_trocar_venda/)
    }
  })

  it('a definição vigente preserva EXECUTE autenticado e revoga anon', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, latestDevolverRpcMigration()), 'utf8')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.devolver_ou_trocar_venda\([^)]*\)\s*FROM PUBLIC/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.devolver_ou_trocar_venda\([^)]*\)\s*TO authenticated/)
    expect(sql).toMatch(
      /REVOKE (?:EXECUTE|ALL) ON FUNCTION public\.devolver_ou_trocar_venda\([^)]*\)\s*FROM (?:PUBLIC, )?anon/,
    )
  })
})
