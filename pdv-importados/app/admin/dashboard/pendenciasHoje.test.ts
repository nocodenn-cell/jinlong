// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PENDENCIAS_HREF,
  contarPendenciasHoje,
  linhasPendencias,
  pendenciasIndisponiveis,
} from './pendenciasHoje'

type Chamada = { tabela: string; filtros: Array<[string, ...unknown[]]> }

/** Query builder falso: registra filtros e devolve a contagem configurada por tabela+filtro. */
function fakeSupabase(resolver: (c: Chamada) => { count: number | null; error: unknown } | 'throw') {
  const chamadas: Chamada[] = []
  const client = {
    from(tabela: string) {
      const c: Chamada = { tabela, filtros: [] }
      chamadas.push(c)
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'lt', 'eq', 'not']) {
        b[m] = (...args: unknown[]) => {
          c.filtros.push([m, ...args])
          return b
        }
      }
      b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
        const r = resolver(c)
        return r === 'throw' ? Promise.reject(new Error('rede')).then(ok, ko) : Promise.resolve(r).then(ok, ko)
      }
      return b
    },
  }
  return { client: client as unknown as SupabaseClient, chamadas }
}

describe('contarPendenciasHoje', () => {
  it('usa as mesmas regras da listagem: em aberto + vencimento < hoje (vencido) ou = hoje', async () => {
    const { client, chamadas } = fakeSupabase((c) => {
      const eq = c.filtros.find((f) => f[0] === 'eq')
      if (c.tabela === 'contas_pagar') return { count: eq ? 1 : 3, error: null }
      return { count: 2, error: null }
    })
    const r = await contarPendenciasHoje(client, '2026-11-27')
    expect(r).toEqual({ pagarVencidas: 3, pagarVenceHoje: 1, receberVencidas: 2 })

    const pagar = chamadas.filter((c) => c.tabela === 'contas_pagar')
    for (const c of pagar) {
      expect(c.filtros).toContainEqual(['in', 'status', ['PENDENTE', 'PARCIAL', 'ATRASADO']])
    }
    expect(pagar[0].filtros).toContainEqual(['lt', 'vencimento', '2026-11-27'])
    expect(pagar[1].filtros).toContainEqual(['eq', 'vencimento', '2026-11-27'])

    const receber = chamadas.find((c) => c.tabela === 'contas_receber')!
    expect(receber.filtros).toContainEqual(['in', 'status', ['ABERTO', 'PARCIAL']])
    expect(receber.filtros).toContainEqual(['lt', 'vencimento', '2026-11-27'])
    // só contagem: nunca traz linhas
    for (const c of chamadas) expect(c.filtros[0]).toEqual(['select', 'id', { count: 'exact', head: true }])
  })

  it('falha de uma consulta vira null (não zero) e não derruba as outras', async () => {
    const { client } = fakeSupabase((c) =>
      c.tabela === 'contas_receber' ? 'throw' : { count: 0, error: c.filtros.some((f) => f[0] === 'eq') ? { message: 'x' } : null },
    )
    const r = await contarPendenciasHoje(client, '2026-11-27')
    expect(r).toEqual({ pagarVencidas: 0, pagarVenceHoje: null, receberVencidas: null })
  })
})

describe('linhasPendencias', () => {
  it('lista só o que tem quantidade, vencidas antes de "vence hoje", com link já filtrado', () => {
    const l = linhasPendencias({ pagarVencidas: 0, pagarVenceHoje: 2, receberVencidas: 5 })
    expect(l.map((x) => x.id)).toEqual(['receberVencidas', 'pagarVenceHoje'])
    expect(l[0]).toMatchObject({ quantidade: 5, tom: 'danger', href: PENDENCIAS_HREF.receberVencidas })
    expect(l[1].tom).toBe('warning')
    expect(PENDENCIAS_HREF.pagarVencidas).toBe('/admin/financeiro?tab=pagar&status=atrasado')
  })

  it('sem pendências → lista vazia; tudo null → indisponível', () => {
    expect(linhasPendencias({ pagarVencidas: 0, pagarVenceHoje: 0, receberVencidas: 0 })).toEqual([])
    expect(pendenciasIndisponiveis({ pagarVencidas: 0, pagarVenceHoje: null, receberVencidas: null })).toBe(false)
    expect(pendenciasIndisponiveis({ pagarVencidas: null, pagarVenceHoje: null, receberVencidas: null })).toBe(true)
  })
})
