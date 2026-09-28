import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UX-04 — NF-e relacionada a um pedido de compra.
 *
 * Regras provadas em SQL (`ux04-oc-recebimento-parcial.test.sql`, T10): o abatimento é feito por
 * `confirmar_importacao_nfe`, item a item, sem tocar em custo/contas a pagar/fiscal. Aqui se prova
 * o que a action faz: só relaciona por escolha explícita (RPC `vincular_importacao_nfe_ordem_compra`),
 * nunca presume o vínculo, devolve o estado real do pedido depois da confirmação e traduz o erro
 * de excesso sobre o saldo.
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const getGerenteLojaId = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId, getGerenteUserId: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/idioma/usuarioIdioma', () => ({ getUsuarioIdioma: async () => ({ idioma: 'pt' }) }))

import { confirmarImportacaoNfe, vincularImportacaoNfeOrdemCompra } from './actions'

const IMP = '11111111-1111-4111-8111-111111111111'
const OC = '22222222-2222-4222-8222-222222222222'

type Cenario = {
  ordemCompraIdNaImportacao: string | null
  ocRow?: unknown
  razao?: Array<{ quantidade: number }>
  rpcErro?: string
}

function montarSupabase(c: Cenario) {
  const rpc = vi.fn(async () => ({ data: null, error: c.rpcErro ? { message: c.rpcErro } : null }))
  const supabase = {
    rpc,
    from: (tabela: string) => {
      const builder: Record<string, unknown> = {}
      const encadeia = () => builder
      builder.select = encadeia
      builder.eq = encadeia
      builder.maybeSingle = async () => {
        if (tabela === 'importacoes_nfe') return { data: { ordem_compra_id: c.ordemCompraIdNaImportacao }, error: null }
        if (tabela === 'ordens_compra') return { data: c.ocRow ?? null, error: null }
        return { data: null, error: null }
      }
      builder.then = (resolve: (v: unknown) => void) =>
        resolve({ data: tabela === 'ordens_compra_recebimentos' ? (c.razao ?? []) : [], error: null })
      return builder
    },
  }
  createClient.mockResolvedValue(supabase)
  return rpc
}

beforeEach(() => {
  vi.clearAllMocks()
  assertGerenteSession.mockResolvedValue({ ok: true, session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' } })
  getGerenteLojaId.mockResolvedValue('loja-a')
})

describe('vincularImportacaoNfeOrdemCompra — o operador escolhe; nada é presumido', () => {
  it('chama a RPC de vínculo com a importação e o pedido escolhidos', async () => {
    const rpc = montarSupabase({ ordemCompraIdNaImportacao: null })
    const res = await vincularImportacaoNfeOrdemCompra({ importacao_id: IMP, ordem_compra_id: OC })

    expect(res.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('vincular_importacao_nfe_ordem_compra', { p_importacao_id: IMP, p_oc_id: OC })
  })

  it('desvincular (id nulo): não envia p_oc_id, e a RPC desfaz o vínculo', async () => {
    const rpc = montarSupabase({ ordemCompraIdNaImportacao: OC })
    const res = await vincularImportacaoNfeOrdemCompra({ importacao_id: IMP, ordem_compra_id: null })

    expect(res.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('vincular_importacao_nfe_ordem_compra', { p_importacao_id: IMP })
  })

  it('ids que não são UUID são recusados antes de qualquer chamada', async () => {
    const rpc = montarSupabase({ ordemCompraIdNaImportacao: null })
    const res = await vincularImportacaoNfeOrdemCompra({ importacao_id: 'x', ordem_compra_id: OC })

    expect(res.success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('pedido encerrado/cancelado ou NF-e já confirmada: mensagem própria do banco, sem vínculo', async () => {
    montarSupabase({ ordemCompraIdNaImportacao: null, rpcErro: 'OC_STATUS_INVALIDO' })
    const a = await vincularImportacaoNfeOrdemCompra({ importacao_id: IMP, ordem_compra_id: OC })
    expect(a.success).toBe(false)
    if (!a.success) expect(a.error).toContain('não está mais aberto para recebimento')

    montarSupabase({ ordemCompraIdNaImportacao: null, rpcErro: 'IMPORT_NFE_STATUS_INVALIDO' })
    const b = await vincularImportacaoNfeOrdemCompra({ importacao_id: IMP, ordem_compra_id: OC })
    expect(b.success).toBe(false)
    if (!b.success) expect(b.error).toContain('já foi confirmada')
  })
})

describe('confirmarImportacaoNfe — resultado no pedido relacionado', () => {
  it('com pedido: informa o estado real (recebido 60 de 100, faltam 40) e quanto a nota abateu', async () => {
    const rpc = montarSupabase({
      ordemCompraIdNaImportacao: OC,
      ocRow: {
        id: OC,
        status: 'EM_TRANSITO',
        encerrada_com_falta_em: null,
        itens: [{ quantidade: 100, quantidade_recebida: 60 }],
      },
      razao: [{ quantidade: 60 }],
    })
    const res = await confirmarImportacaoNfe({ importacao_id: IMP })

    expect(res.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('confirmar_importacao_nfe', { p_importacao_id: IMP })
    if (res.success) {
      expect(res.data.abatido).toBe(60)
      expect(res.data.oc).toMatchObject({ pedido_total: 100, recebido_total: 60, pendente_total: 40, encerrada: false })
    }
  })

  it('pedido que fechou com a nota: encerrada = true', async () => {
    montarSupabase({
      ordemCompraIdNaImportacao: OC,
      ocRow: { id: OC, status: 'RECEBIDA', encerrada_com_falta_em: null, itens: [{ quantidade: 100, quantidade_recebida: 100 }] },
      razao: [{ quantidade: 40 }],
    })
    const res = await confirmarImportacaoNfe({ importacao_id: IMP })

    expect(res.success).toBe(true)
    if (res.success) expect(res.data.oc?.encerrada).toBe(true)
  })

  it('sem pedido relacionado: nada é lido do pedido (a NF-e segue como sempre)', async () => {
    montarSupabase({ ordemCompraIdNaImportacao: null })
    const res = await confirmarImportacaoNfe({ importacao_id: IMP })

    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.oc).toBeNull()
      expect(res.data.abatido).toBe(0)
    }
  })

  it('nota acima do saldo do pedido (P0): confirmação recusada com instrução clara — nada é lançado', async () => {
    montarSupabase({ ordemCompraIdNaImportacao: OC, rpcErro: `OC_QTD_ACIMA_SALDO:${OC}:40.000` })
    const res = await confirmarImportacaoNfe({ importacao_id: IMP })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toContain('maior do que ainda falta receber do pedido vinculado')
      expect(res.error).toContain('Nada foi lançado no estoque')
      expect(res.error).toContain('desvincule o pedido')
    }
  })
})
