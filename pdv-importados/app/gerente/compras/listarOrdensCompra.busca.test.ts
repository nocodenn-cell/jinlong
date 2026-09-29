import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Busca de `listarOrdensCompra` (autocomplete de OC do recebimento e busca de /admin/compras).
 * O `.or()` era mockado sem olhar a expressão, e por isso `id.ilike` sobre a coluna uuid
 * (`operator does not exist: uuid ~~* unknown`) passou: aqui a expressão enviada é conferida, junto
 * com o que a busca NÃO pode perder — escopo de loja, status, ordenação e paginação.
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const getGerenteLojaId = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId, getGerenteUserId: vi.fn() }))

import { listarOrdensCompra, listarOrdensCompraElegiveisParaVinculo } from './actions'

type Chamada = { metodo: string; args: unknown[] }

/** Builder que registra cada chamada e devolve `resposta` ao ser aguardado (como o do PostgREST). */
function builderRegistrando(
  chamadas: Chamada[],
  resposta: { data: unknown[] | null; error: { message: string } | null; count: number | null },
) {
  const builder: Record<string, unknown> = {}
  for (const metodo of ['select', 'eq', 'order', 'range', 'or']) {
    builder[metodo] = (...args: unknown[]) => {
      chamadas.push({ metodo, args })
      return builder
    }
  }
  builder.then = (resolve: (v: unknown) => void) => resolve(resposta)
  return builder
}

const LINHA = {
  id: 'cfd732e5-0f95-4c0d-ac27-6fa85b027740',
  fornecedor_id: null,
  fornecedor_nome: 'Fornecedor Teste PR1',
  status: 'CONFIRMADA',
  data_emissao: '2026-09-29',
  data_prevista_chegada: null,
  observacao: null,
  created_at: '2026-09-29T00:00:00Z',
  fornecedor: null,
  itens: [{ quantidade: 100, preco_unitario: 3, quantidade_recebida: 0 }],
}

function preparar(resposta = { data: [LINHA] as unknown[] | null, error: null as { message: string } | null, count: 1 as number | null }) {
  const chamadas: Chamada[] = []
  createClient.mockResolvedValue({ from: () => builderRegistrando(chamadas, resposta) })
  return chamadas
}

const orDe = (c: Chamada[]) => c.filter((x) => x.metodo === 'or').map((x) => String(x.args[0]))

describe('listarOrdensCompra — busca', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue({ ok: true, session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' } })
    getGerenteLojaId.mockResolvedValue('loja-a')
  })

  it('fornecedor: busca por fornecedor_nome e devolve a OC no formato de sempre', async () => {
    const chamadas = preparar()
    const r = await listarOrdensCompra({ busca: 'Teste PR1', limite: 10, offset: 0 })

    expect(orDe(chamadas)).toEqual(['fornecedor_nome.ilike.%Teste PR1%'])
    expect(r.total).toBe(1)
    expect(r.rows[0]).toMatchObject({
      id: LINHA.id,
      fornecedor_nome: 'Fornecedor Teste PR1',
      status: 'CONFIRMADA',
      pedido_total: 100,
      pendente_total: 100,
    })
  })

  it('código curto da OC: faixa de uuid, nunca ilike na coluna uuid', async () => {
    const chamadas = preparar()
    await listarOrdensCompra({ busca: 'CFD732E5', limite: 10, offset: 0 })

    const filtro = orDe(chamadas)[0]
    expect(filtro).toContain('and(id.gte.cfd732e5-0000-0000-0000-000000000000,id.lte.cfd732e5-ffff-ffff-ffff-ffffffffffff)')
    expect(filtro).not.toMatch(/id\.i?like/)
    // o erro do Postgres que quebrava tudo não pode voltar como "lista vazia silenciosa" por esse motivo
    expect(filtro).not.toContain('uuid ~~*')
  })

  it('sem resultado: lista vazia e total 0', async () => {
    preparar({ data: [], error: null, count: 0 })
    const r = await listarOrdensCompra({ busca: 'naoexiste', limite: 10, offset: 0 })
    expect(r).toEqual({ rows: [], total: 0 })
  })

  it('busca vazia: nenhum .or() é aplicado (lista tudo da loja/status)', async () => {
    for (const busca of [undefined, '', '   ']) {
      const chamadas = preparar()
      await listarOrdensCompra({ busca, limite: 10, offset: 0 })
      expect(orDe(chamadas)).toEqual([])
    }
  })

  it('preserva loja, status, ordenação e paginação junto com a busca', async () => {
    const chamadas = preparar()
    await listarOrdensCompra({ status: 'EM_TRANSITO', busca: 'Alfa', limite: 10, offset: 20 })

    const eqs = chamadas.filter((c) => c.metodo === 'eq').map((c) => c.args)
    expect(eqs).toContainEqual(['loja_id', 'loja-a'])
    expect(eqs).toContainEqual(['status', 'EM_TRANSITO'])
    expect(chamadas.find((c) => c.metodo === 'order')?.args).toEqual(['created_at', { ascending: false }])
    expect(chamadas.find((c) => c.metodo === 'range')?.args).toEqual([20, 29])
  })

  it('sem status informado, não filtra por status (lista de Compras)', async () => {
    const chamadas = preparar()
    await listarOrdensCompra({ busca: 'Alfa', limite: 10, offset: 0 })
    expect(chamadas.filter((c) => c.metodo === 'eq').map((c) => c.args[0])).toEqual(['loja_id'])
  })

  it('escopo de loja vem da sessão, não do termo digitado', async () => {
    getGerenteLojaId.mockResolvedValue('loja-b')
    const chamadas = preparar()
    await listarOrdensCompra({ busca: 'loja-a', limite: 10, offset: 0 })
    expect(chamadas.filter((c) => c.metodo === 'eq').map((c) => c.args)).toContainEqual(['loja_id', 'loja-b'])
  })

  it('erro de consulta continua devolvendo lista vazia (contrato atual)', async () => {
    preparar({ data: null, error: { message: 'boom' }, count: null })
    expect(await listarOrdensCompra({ busca: 'Alfa', limite: 10, offset: 0 })).toEqual({ rows: [], total: 0 })
  })

  it('vínculo do recebimento: as duas consultas (CONFIRMADA e EM_TRANSITO) recebem o mesmo filtro por fornecedor', async () => {
    const chamadas = preparar()
    await listarOrdensCompraElegiveisParaVinculo('Teste PR1')

    expect(orDe(chamadas)).toEqual(['fornecedor_nome.ilike.%Teste PR1%', 'fornecedor_nome.ilike.%Teste PR1%'])
    const status = chamadas.filter((c) => c.metodo === 'eq' && c.args[0] === 'status').map((c) => c.args[1])
    expect(status.sort()).toEqual(['CONFIRMADA', 'EM_TRANSITO'])
  })
})
