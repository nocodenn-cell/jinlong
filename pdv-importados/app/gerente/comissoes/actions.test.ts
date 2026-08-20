import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const assertGerenteSessionMock = vi.fn()
const revalidatePathMock = vi.fn()
const rpcMock = vi.fn()
const createClientMock = vi.fn(async () => ({ rpc: rpcMock }))

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: assertGerenteSessionMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

describe('gerente/comissoes actions', () => {
  // Ver comentário equivalente em gerente/transferencias/actions.test.ts:
  // import isolado do grafo de módulos evita hookTimeout flake em máquina lenta.
  beforeAll(async () => {
    await import('./actions')
  }, 60_000)

  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSessionMock.mockResolvedValue({
      ok: true,
      session: { userId: 'mgr-1', lojaId: 'loja-1' },
    })
  })

  describe('marcarComissoesPagas — P0: consome liquidar_comissoes, não marcar_comissoes_pagas', () => {
    it('chama a RPC liquidar_comissoes (nunca marcar_comissoes_pagas)', async () => {
      rpcMock.mockResolvedValue({
        data: [
          {
            pagamento_id: 'pag-1',
            valor_bruto: 50,
            valor_compensado: 8,
            valor_liquido: 42,
            comissoes_pagas: 1,
            idempotent_replay: false,
          },
        ],
        error: null,
      })

      const { marcarComissoesPagas } = await import('./actions')
      const res = await marcarComissoesPagas({ operador_id: '11111111-1111-1111-1111-111111111111', ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] })

      expect(rpcMock).toHaveBeenCalledTimes(1)
      expect(rpcMock.mock.calls[0][0]).toBe('liquidar_comissoes')
      expect(rpcMock.mock.calls[0][0]).not.toBe('marcar_comissoes_pagas')

      expect(res.success).toBe(true)
      if (res.success) {
        // resultado real repassado, não reduzido a uma contagem
        expect(res.data).toEqual({
          pagamentoId: 'pag-1',
          valorBruto: 50,
          valorCompensado: 8,
          valorLiquido: 42,
          comissoesPagas: 1,
          idempotentReplay: false,
        })
      }
    })

    it('a chave de idempotência enviada à RPC é determinística: mesma seleção em ordens diferentes produz a MESMA chave', async () => {
      rpcMock.mockResolvedValue({
        data: [{ pagamento_id: 'p', valor_bruto: 1, valor_compensado: 0, valor_liquido: 1, comissoes_pagas: 2, idempotent_replay: false }],
        error: null,
      })

      const { marcarComissoesPagas } = await import('./actions')
      await marcarComissoesPagas({ operador_id: '11111111-1111-1111-1111-111111111111', ids: ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] })
      const chave1 = rpcMock.mock.calls[0][1].p_idempotency_key

      rpcMock.mockClear()
      await marcarComissoesPagas({ operador_id: '11111111-1111-1111-1111-111111111111', ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'] })
      const chave2 = rpcMock.mock.calls[0][1].p_idempotency_key

      expect(chave1).toBe(chave2)
    })

    it('operadores ou conjuntos de ids diferentes produzem chaves diferentes', async () => {
      rpcMock.mockResolvedValue({
        data: [{ pagamento_id: 'p', valor_bruto: 1, valor_compensado: 0, valor_liquido: 1, comissoes_pagas: 1, idempotent_replay: false }],
        error: null,
      })

      const { marcarComissoesPagas } = await import('./actions')
      await marcarComissoesPagas({ operador_id: '11111111-1111-1111-1111-111111111111', ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] })
      const chaveA = rpcMock.mock.calls[0][1].p_idempotency_key

      rpcMock.mockClear()
      await marcarComissoesPagas({ operador_id: '22222222-2222-2222-2222-222222222222', ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] })
      const chaveOperadorDiferente = rpcMock.mock.calls[0][1].p_idempotency_key

      rpcMock.mockClear()
      await marcarComissoesPagas({ operador_id: '11111111-1111-1111-1111-111111111111', ids: ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'] })
      const chaveIdsDiferentes = rpcMock.mock.calls[0][1].p_idempotency_key

      expect(chaveA).not.toBe(chaveOperadorDiferente)
      expect(chaveA).not.toBe(chaveIdsDiferentes)
    })

    it('propaga idempotentReplay=true tal como a RPC devolveu, sem tratar como pagamento novo', async () => {
      rpcMock.mockResolvedValue({
        data: [
          { pagamento_id: 'pag-existente', valor_bruto: 50, valor_compensado: 8, valor_liquido: 42, comissoes_pagas: 1, idempotent_replay: true },
        ],
        error: null,
      })

      const { marcarComissoesPagas } = await import('./actions')
      const res = await marcarComissoesPagas({ operador_id: '11111111-1111-1111-1111-111111111111', ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] })

      expect(res.success).toBe(true)
      if (res.success) expect(res.data.idempotentReplay).toBe(true)
    })

    it('erro da RPC é propagado sem mascarar', async () => {
      rpcMock.mockResolvedValue({ data: null, error: { message: 'COMISSOES_LIQUIDAR_PERMISSAO' } })

      const { marcarComissoesPagas } = await import('./actions')
      const res = await marcarComissoesPagas({ operador_id: '11111111-1111-1111-1111-111111111111', ids: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'] })

      expect(res.success).toBe(false)
      if (!res.success) expect(res.error).toContain('COMISSOES_LIQUIDAR_PERMISSAO')
    })
  })

  describe('carregarResumoComissoes — P1: semântica líquida explícita', () => {
    it('mapeia os campos líquidos da RPC (bruto/ajustes/líquido pago/saldo residual), não bruto disfarçado', async () => {
      rpcMock.mockResolvedValue({
        data: [
          {
            operador_id: 'op-1',
            operador_nome: 'Ana',
            total_vendas: 3,
            total_comissao_bruta: 90,
            total_ajustes: 20,
            total_liquido_pago: 50,
            total_saldo_residual: 20,
          },
        ],
        error: null,
      })

      const { carregarResumoComissoes } = await import('./actions')
      const res = await carregarResumoComissoes({ status: 'todos' })

      expect(rpcMock.mock.calls[0][0]).toBe('resumo_comissoes_por_operador')
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data[0]).toEqual({
          operadorId: 'op-1',
          operadorNome: 'Ana',
          totalVendas: 3,
          totalComissaoBruta: 90,
          totalAjustes: 20,
          totalLiquidoPago: 50,
          totalSaldoResidual: 20,
        })
      }
    })
  })

  describe('carregarDetalheComissoes — P1: ajustes aninhados, sem recalcular no frontend', () => {
    it('mapeia o array de ajustes (tipo real, ator, origem, consumo) tal como a RPC devolveu', async () => {
      rpcMock.mockResolvedValue({
        data: [
          {
            comissao_id: 'com-1',
            venda_id: 'venda-1',
            base_calculo: 100,
            status: 'pendente',
            created_at: '2026-08-01T00:00:00Z',
            valor_original: 10,
            valor_ajustado: 4,
            valor_compensado: 4,
            valor_liquido_apurado: 6,
            valor_pago: null,
            pagamento_id: null,
            pago_em: null,
            saldo_final: 6,
            ajustes: [
              {
                ajuste_id: 'aj-1',
                tipo: 'TROCA',
                valor: 4,
                ator_id: 'user-1',
                origem_tipo: 'OPERACAO_POS_VENDA',
                origem_ocorrida_em: '2026-08-01T00:00:00Z',
                venda_substituta_id: 'venda-2',
                created_at: '2026-08-01T00:00:00Z',
                valor_consumido: 4,
                valor_pendente: 0,
              },
            ],
          },
        ],
        error: null,
      })

      const { carregarDetalheComissoes } = await import('./actions')
      const res = await carregarDetalheComissoes('op-1', { status: 'todos' })

      expect(rpcMock.mock.calls[0][0]).toBe('detalhe_comissoes_operador')
      expect(res.success).toBe(true)
      if (res.success) {
        expect(res.data[0].ajustes).toEqual([
          {
            ajusteId: 'aj-1',
            tipo: 'TROCA',
            valor: 4,
            atorId: 'user-1',
            origemTipo: 'OPERACAO_POS_VENDA',
            origemOcorridaEm: '2026-08-01T00:00:00Z',
            vendaSubstitutaId: 'venda-2',
            createdAt: '2026-08-01T00:00:00Z',
            valorConsumido: 4,
            valorPendente: 0,
          },
        ])
      }
    })

    it('comissão sem ajustes mapeia para array vazio, não undefined', async () => {
      rpcMock.mockResolvedValue({
        data: [
          {
            comissao_id: 'com-2',
            venda_id: 'venda-2',
            base_calculo: 50,
            status: 'pendente',
            created_at: '2026-08-01T00:00:00Z',
            valor_original: 5,
            valor_ajustado: 0,
            valor_compensado: 0,
            valor_liquido_apurado: 5,
            valor_pago: null,
            pagamento_id: null,
            pago_em: null,
            saldo_final: 5,
            ajustes: [],
          },
        ],
        error: null,
      })

      const { carregarDetalheComissoes } = await import('./actions')
      const res = await carregarDetalheComissoes('op-1', { status: 'todos' })

      expect(res.success).toBe(true)
      if (res.success) expect(res.data[0].ajustes).toEqual([])
    })
  })
})
