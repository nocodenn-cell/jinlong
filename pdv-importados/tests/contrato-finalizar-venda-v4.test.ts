/**
 * Contrato versionado × implementação real: finalizar_venda_transacional_canonica_v4.
 *
 * Por que: o contrato publicado em docs/contracts/v1 descrevia a v3 enquanto produção
 * roda a v4 (22 args). Documentação de RPC divergente já levou a um caminho de apply
 * paralelo que recriava a v3 em produção (ver ADR-011). Este teste mantém o JSON preso
 * à assinatura real da migration — se alguém alterar a RPC sem atualizar o contrato,
 * ou vice-versa, o CI falha.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.resolve(ROOT, '../backend/supabase/migrations')
const GUARD = '20260809120837_finalize_v4_scope_guard_22args.sql'
const CONTRACT = path.resolve(ROOT, '../docs/contracts/v1/rpc-finalizar-venda-canonica-v4.json')
const CALLER = path.resolve(ROOT, 'app/caixa/server/caixaVendas.impl.ts')

/** Extrai os nomes de parâmetro da assinatura do wrapper (não da _unscoped). */
function argsDaMigration(): string[] {
  const src = fs.readFileSync(path.join(MIGRATIONS, GUARD), 'utf8')
  const inicio = src.indexOf(
    'CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(',
  )
  expect(inicio, 'assinatura do wrapper v4 não encontrada na migration').toBeGreaterThan(-1)
  const fim = src.indexOf('RETURNS TABLE', inicio)
  const bloco = src.slice(inicio, fim)
  return [...bloco.matchAll(/^\s*(p_[a-z0-9_]+)\s/gm)].map((m) => m[1])
}

describe('contrato rpc-finalizar-venda-canonica-v4', () => {
  const contrato = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'))
  const args = argsDaMigration()

  it('a migration declara exatamente 22 argumentos', () => {
    expect(args).toHaveLength(22)
  })

  it('as propriedades do contrato batem com a assinatura da migration', () => {
    expect(Object.keys(contrato.properties).sort()).toEqual([...args].sort())
  })

  it('exige os 4 argumentos sem DEFAULT como required', () => {
    expect(contrato.required.sort()).toEqual(
      ['p_caixa_id', 'p_loja_id', 'p_operador_id', 'p_venda_id'].sort(),
    )
  })

  it('não admite propriedades fora da assinatura', () => {
    expect(contrato.additionalProperties).toBe(false)
  })

  it('documenta os códigos de erro que a migration levanta', () => {
    const src = fs.readFileSync(path.join(MIGRATIONS, GUARD), 'utf8')
    const levantados = new Set(
      [...src.matchAll(/RAISE EXCEPTION '(FINALIZAR_VENDA_CANONICA_[A-Z_]+)'/g)].map((m) => m[1]),
    )
    expect(levantados.size).toBeGreaterThan(0)
    for (const codigo of levantados) {
      expect(contrato['x-errors']).toContain(codigo)
    }
  })

  it('o caller real só passa chaves previstas no contrato', () => {
    const src = fs.readFileSync(CALLER, 'utf8')
    const inicio = src.indexOf("supabase.rpc('finalizar_venda_transacional_canonica_v4'")
    expect(inicio, 'chamada da v4 não encontrada no caller').toBeGreaterThan(-1)
    const bloco = src.slice(inicio, src.indexOf('\n    })', inicio))
    const chaves = [...bloco.matchAll(/^\s{6}(p_[a-z0-9_]+):/gm)].map((m) => m[1])
    expect(chaves.length).toBeGreaterThan(0)
    for (const chave of chaves) {
      expect(Object.keys(contrato.properties)).toContain(chave)
    }
  })

  it('a v3 continua marcada como histórica', () => {
    const v3 = JSON.parse(
      fs.readFileSync(path.resolve(ROOT, '../docs/contracts/v1/rpc-finalizar-venda-canonica-v3.json'), 'utf8'),
    )
    expect(v3.deprecated).toBe(true)
  })
})
