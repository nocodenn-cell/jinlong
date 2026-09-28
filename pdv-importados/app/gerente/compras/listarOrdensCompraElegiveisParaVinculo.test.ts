import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S8/RM-14, PR2 — leitura de OCs elegíveis para o vínculo opcional do
 * recebimento manual. A função reaproveita `listarOrdensCompra` (chamada
 * duas vezes, uma por status) em vez de uma query nova — este teste prova
 * que o resultado é a união de CONFIRMADA + EM_TRANSITO, escopada pela loja
 * da sessão, sem tocar RASCUNHO/CANCELADA/RECEBIDA.
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const getGerenteLojaId = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId, getGerenteUserId: vi.fn() }))

import { listarOrdensCompraElegiveisParaVinculo } from './actions'

type RowByStatus = Record<string, Array<Record<string, unknown>>>

function buildOrdensCompraQueryMock(rowsByStatus: RowByStatus, lojaEsperada: string) {
  return (table: string) => {
    if (table !== 'ordens_compra') throw new Error(`tabela inesperada: ${table}`)
    let status: string | null = null
    let lojaFiltrada: string | null = null
    const builder = {
      select: () => builder,
      eq: (col: string, val: string) => {
        if (col === 'status') status = val
        if (col === 'loja_id') lojaFiltrada = val
        return builder
      },
      order: () => builder,
      range: () => builder,
      or: () => builder,
      then: (resolve: (v: { data: unknown[]; error: null; count: number }) => void) => {
        // Prova que o escopo de loja passado pela sessão de fato chega à query
        // — reaproveitando o próprio comportamento já testável de listarOrdensCompra.
        if (lojaFiltrada !== lojaEsperada) {
          resolve({ data: [], error: null, count: 0 })
          return
        }
        const rows = status ? (rowsByStatus[status] ?? []) : []
        resolve({ data: rows, error: null, count: rows.length })
      },
    }
    return builder
  }
}

describe('listarOrdensCompraElegiveisParaVinculo (S8/RM-14, PR2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue({ ok: true, session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' } })
    getGerenteLojaId.mockResolvedValue('loja-a')
  })

  it('retorna a união de OCs CONFIRMADA + EM_TRANSITO da loja', async () => {
    createClient.mockResolvedValue({
      from: buildOrdensCompraQueryMock(
        {
          CONFIRMADA: [
            {
              id: 'oc-1',
              fornecedor_id: 'f1',
              fornecedor_nome: null,
              status: 'CONFIRMADA',
              data_emissao: '2026-09-01',
              data_prevista_chegada: null,
              observacao: null,
              created_at: '2026-09-01T00:00:00Z',
              fornecedor: { nome: 'Fornecedor A' },
              itens: [],
            },
          ],
          EM_TRANSITO: [
            {
              id: 'oc-2',
              fornecedor_id: 'f2',
              fornecedor_nome: null,
              status: 'EM_TRANSITO',
              data_emissao: '2026-09-02',
              data_prevista_chegada: null,
              observacao: null,
              created_at: '2026-09-02T00:00:00Z',
              fornecedor: { nome: 'Fornecedor B' },
              itens: [],
            },
          ],
        },
        'loja-a',
      ),
    })

    const rows = await listarOrdensCompraElegiveisParaVinculo()

    expect(rows.map((r) => r.id).sort()).toEqual(['oc-1', 'oc-2'])
    expect(rows.find((r) => r.id === 'oc-1')?.status).toBe('CONFIRMADA')
    expect(rows.find((r) => r.id === 'oc-2')?.status).toBe('EM_TRANSITO')
  })

  it('não inclui RASCUNHO, CANCELADA nem RECEBIDA — só as duas consultas elegíveis são feitas', async () => {
    createClient.mockResolvedValue({
      from: buildOrdensCompraQueryMock(
        {
          RASCUNHO: [{ id: 'oc-rascunho', fornecedor: null, itens: [] }],
          RECEBIDA: [{ id: 'oc-recebida', fornecedor: null, itens: [] }],
          CANCELADA: [{ id: 'oc-cancelada', fornecedor: null, itens: [] }],
        },
        'loja-a',
      ),
    })

    const rows = await listarOrdensCompraElegiveisParaVinculo()
    expect(rows).toEqual([])
  })

  it('escopa por loja da sessão — não vaza OC de outra loja', async () => {
    getGerenteLojaId.mockResolvedValue('loja-b')
    createClient.mockResolvedValue({
      from: buildOrdensCompraQueryMock(
        { CONFIRMADA: [{ id: 'oc-loja-a', fornecedor: null, itens: [] }] },
        'loja-a', // mock só devolve linhas quando o filtro bate com 'loja-a'
      ),
    })

    const rows = await listarOrdensCompraElegiveisParaVinculo()
    expect(rows).toEqual([])
  })

  it('sem sessão válida, retorna lista vazia (fail closed)', async () => {
    assertGerenteSession.mockResolvedValue({ ok: false, error: 'Faça login.' })
    createClient.mockResolvedValue({ from: buildOrdensCompraQueryMock({}, 'loja-a') })

    const rows = await listarOrdensCompraElegiveisParaVinculo()
    expect(rows).toEqual([])
  })
})
