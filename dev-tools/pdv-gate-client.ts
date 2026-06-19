import {
  LOJA_MATRIZ_ID,
  requireSupabaseEnv,
  type SupabaseEnv,
} from './load-env.js'
import type { GateChaosLayer } from './gate-chaos-layer.js'
import { PdvStressClient, type SalePostResult } from './pdv-stress-client.js'

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Cliente do gate — estende stress client com fontes web_caixa, sync_outbox e cancel.
 */
export class PdvGateClient extends PdvStressClient {
  gerenteId: string | null = null
  readonly chaos: GateChaosLayer | null

  constructor(env?: SupabaseEnv, chaos: GateChaosLayer | null = null) {
    super(env)
    this.chaos = chaos
  }

  async initGate(): Promise<void> {
    await this.init()
    await this.resolveGerenteId()
  }

  private async resolveGerenteId(): Promise<void> {
    const env = requireSupabaseEnv()
    const { data, error } = await this.admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (error) throw new Error(`listUsers gerente: ${error.message}`)
    const gerente = data.users.find(
      (u) => u.email?.toLowerCase() === env.gerenteEmail.toLowerCase(),
    )
    if (!gerente?.id) {
      throw new Error(`Gerente ${env.gerenteEmail} ausente — rode seed:dev-users`)
    }
    this.gerenteId = gerente.id
  }

  /** Venda web_caixa (v3) com IDs determinísticos. */
  async postSaleWeb(
    saleId: string,
    itemId: string,
  ): Promise<SalePostResult & { source: 'web_caixa' }> {
    const r = await this.invokeRpc('postSaleWeb', () =>
      this.postSaleWithIds(saleId, itemId, 'web-caixa'),
      () => this.verifySaleLedger(saleId),
    )
    return { ...r, source: 'web_caixa' }
  }

  /** Venda sync_outbox (v3) com IDs determinísticos. */
  async postSaleSyncOutbox(
    saleId: string,
    itemId: string,
  ): Promise<SalePostResult & { source: 'sync_outbox' }> {
    const r = await this.invokeRpc('postSaleSyncOutbox', () =>
      this.postSaleWithIds(saleId, itemId, 'sync-outbox'),
      () => this.verifySaleLedger(saleId),
    )
    return { ...r, source: 'sync_outbox' }
  }

  /** Replay sync_outbox em venda já CONCLUIDA (cenário cross-source). */
  async replaySyncOutboxEnsure(saleId: string): Promise<{ ok: boolean; error?: string }> {
    return this.invokeRpc('replaySyncOutbox', async () => {
      const { error } = await this.admin.rpc('ensure_venda_evento_registrado', {
        p_sale_id: saleId,
        p_source: 'sync_outbox',
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    })
  }

  /** Cancelamento → SALE_CANCELLED no ledger (gerente_panel). */
  async cancelSale(saleId: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.gerenteId) return { ok: false, error: 'gerenteId ausente' }
    return this.invokeRpc('cancelSale', async () => {
      const { error } = await this.admin.rpc('cancelar_venda_transacional', {
        p_venda_id: saleId,
        p_motivo: 'gate-simulator-cancel',
        p_operador_id: this.gerenteId,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    })
  }

  async closeCaixa(valorContado?: number) {
    return this.invokeRpc('closeCaixa', () => super.closeCaixa(valorContado))
  }

  protected async invokeRpc<T>(
    op: string,
    fn: () => Promise<T>,
    verifyLedger?: () => Promise<boolean>,
  ): Promise<T> {
    if (this.chaos) {
      return this.chaos.execute(op, fn, verifyLedger ? { verifyLedger } : undefined)
    }
    return fn()
  }

  protected async verifySaleLedger(saleId: string): Promise<boolean> {
    const [{ count: vCount }, { count: eCount }] = await Promise.all([
      this.admin
        .from('vendas')
        .select('id', { count: 'exact', head: true })
        .eq('id', saleId)
        .eq('status', 'CONCLUIDA'),
      this.admin
        .from('venda_eventos')
        .select('id', { count: 'exact', head: true })
        .eq('sale_id', saleId)
        .eq('event_type', 'SALE_REGISTERED'),
    ])
    return (vCount ?? 0) === 1 && (eCount ?? 0) === 1
  }

  protected async postSaleWithIds(
    saleId: string,
    itemId: string,
    terminalId: 'web-caixa' | 'sync-outbox',
  ): Promise<SalePostResult> {
    if (!this.operadorId || !this.caixaId || !this.produtoId) {
      return { ok: false, error: 'Cliente não inicializado' }
    }

    const total = this.precoUnitario
    const itens = [
      {
        item_id: itemId,
        produto_id: this.produtoId,
        quantidade: 1,
        preco_original: total,
        preco_unitario: total,
        desconto_unitario: 0,
        tipo_preco: 'VAREJO',
      },
    ]

    const { data, error } = await this.admin.rpc('finalizar_venda_transacional_canonica_v3', {
      p_venda_id: saleId,
      p_caixa_id: this.caixaId,
      p_operador_id: this.operadorId,
      p_loja_id: LOJA_MATRIZ_ID,
      p_forma_pagamento: 'DINHEIRO',
      p_total_bruto: total,
      p_total_desconto: 0,
      p_total_liquido: total,
      p_pagamentos: [{ forma_pagamento: 'DINHEIRO', valor: total }],
      p_itens: itens,
      p_desconto_gerente_token: null,
      p_desconto_gerente_percentual: null,
      p_strict_manager_discount_auth: false,
      p_fiscal_auto_enqueue: false,
      p_ip_address: 'pdv-gate-simulator',
      p_user_agent: 'pdv-gate-simulator',
      p_device_id: 'pdv-gate-simulator',
      p_terminal_id: terminalId,
    })
    if (error) return { ok: false, error: error.message }
    const row = (Array.isArray(data) ? data[0] : data) as {
      venda_id?: string
      status?: string
      event_id?: string
      mensagem?: string
    }
    if (!row?.venda_id || row.status !== 'CONCLUIDA') {
      return { ok: false, error: String(row?.mensagem ?? 'Venda não concluída') }
    }
    return {
      ok: true,
      vendaId: String(row.venda_id),
      eventId: row.event_id ? String(row.event_id) : null,
    }
  }
}

/** Retry determinístico: 1ª tentativa falha, 2ª executa (sem aleatoriedade). */
export async function withDeterministicRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    throw new Error('GATE_SIMULATED_NETWORK_TIMEOUT')
  } catch {
    return fn()
  }
}
