import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import {
  DEMO_PRODUTO_CODIGO,
  LOJA_MATRIZ_ID,
  requireSupabaseEnv,
  type SupabaseEnv,
} from './load-env.js'

export type SalePostResult =
  | { ok: true; vendaId: string; eventId: string | null }
  | { ok: false; error: string }

export type ClosePostResult =
  | { ok: true; caixaId: string; alreadyClosed?: boolean }
  | { ok: false; error: string }

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

type RpcVendaRow = {
  venda_id?: string
  status?: string
  event_id?: string
  mensagem?: string
}

/**
 * Cliente isolado para stress — chama RPCs diretamente (equivalente a POST /sale no backend).
 */
export class PdvStressClient {
  readonly admin: SupabaseClient
  readonly auth: SupabaseClient
  private readonly env: SupabaseEnv
  operadorId: string | null = null
  caixaId: string | null = null
  produtoId: string | null = null
  precoUnitario = 0

  constructor(env?: SupabaseEnv) {
    this.env = env ?? requireSupabaseEnv()
    this.admin = createClient(this.env.url, this.env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    this.auth = createClient(this.env.url, this.env.anonKey || this.env.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  async init(): Promise<void> {
    const { data: signIn, error: signErr } = await this.auth.auth.signInWithPassword({
      email: this.env.operadorEmail,
      password: this.env.operadorPassword,
    })
    if (signErr || !signIn.user) {
      throw new Error(`Login operador falhou: ${signErr?.message ?? 'sem usuário'}`)
    }
    this.operadorId = signIn.user.id

    const { data: caixa } = await this.admin
      .from('caixas')
      .select('id')
      .eq('operador_id', this.operadorId)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (caixa?.id) {
      this.caixaId = caixa.id
    } else {
      const { data: novo, error: insErr } = await this.admin
        .from('caixas')
        .insert({
          operador_id: this.operadorId,
          loja_id: LOJA_MATRIZ_ID,
          valor_inicial: 100,
          status: 'ABERTO',
        })
        .select('id')
        .single()
      if (insErr || !novo) throw new Error(`Abrir caixa: ${insErr?.message}`)
      this.caixaId = novo.id
    }

    const { data: prod } = await this.admin
      .from('produtos')
      .select('id')
      .eq('codigo_barras', DEMO_PRODUTO_CODIGO)
      .maybeSingle()
    if (!prod?.id) {
      throw new Error(`Produto demo ${DEMO_PRODUTO_CODIGO} ausente (migration 027).`)
    }
    this.produtoId = prod.id

    const { data: calc, error: calcErr } = await this.admin.rpc('calcular_preco_produto', {
      p_produto_id: prod.id,
      p_quantidade: 1,
      p_loja_id: LOJA_MATRIZ_ID,
    })
    if (calcErr) throw new Error(`calcular_preco_produto: ${calcErr.message}`)
    const preco = Number((calc as { preco?: number })?.preco ?? 0)
    if (!Number.isFinite(preco) || preco <= 0) {
      throw new Error('Preço inválido do produto demo.')
    }
    this.precoUnitario = roundMoney2(preco)
  }

  /** Finaliza venda via RPC canônica v3 (autoridade backend + ledger). */
  async postSale(idempotencyKey?: string): Promise<SalePostResult> {
    if (!this.operadorId || !this.caixaId || !this.produtoId) {
      return { ok: false, error: 'Cliente não inicializado. Chame init() primeiro.' }
    }

    const vendaId = idempotencyKey ?? randomUUID()
    const total = this.precoUnitario
    const itens = [
      {
        item_id: randomUUID(),
        produto_id: this.produtoId,
        quantidade: 1,
        preco_original: total,
        preco_unitario: total,
        desconto_unitario: 0,
        tipo_preco: 'VAREJO',
      },
    ]

    const { data, error } = await this.admin.rpc('finalizar_venda_transacional_canonica_v3', {
      p_venda_id: vendaId,
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
      p_ip_address: 'dev-tools',
      p_user_agent: 'pdv-stress-test',
      p_device_id: 'dev-tools-stress',
      p_terminal_id: 'dev-tools',
    })

    if (error) return { ok: false, error: error.message }

    const row = (Array.isArray(data) ? data[0] : data) as RpcVendaRow | undefined
    if (!row?.venda_id || row.status !== 'CONCLUIDA') {
      return {
        ok: false,
        error: String(row?.mensagem ?? 'Venda não concluída'),
      }
    }

    return {
      ok: true,
      vendaId: String(row.venda_id),
      eventId: row.event_id ? String(row.event_id) : null,
    }
  }

  /** Fecha caixa com sessão do operador (JWT). */
  async closeCaixa(valorContado?: number): Promise<ClosePostResult> {
    if (!this.operadorId) {
      return { ok: false, error: 'Operador não autenticado.' }
    }

    let contado = valorContado
    if (contado === undefined && this.caixaId) {
      const { data } = await this.admin.rpc('calcular_valor_sistema_dinheiro_caixa', {
        p_caixa_id: this.caixaId,
      })
      contado = roundMoney2(Number(data ?? 0))
    }
    contado = roundMoney2(contado ?? 0)

    const { data, error } = await this.auth.rpc('fechar_caixa_atomico', {
      p_operador_id: this.operadorId,
      p_valor_contado: contado,
      p_motivo: '',
    })

    if (error) return { ok: false, error: error.message }

    const row = (Array.isArray(data) ? data[0] : data) as {
      o_caixa_id?: string
      o_ja_fechado?: boolean
    }
    if (!row?.o_caixa_id) return { ok: false, error: 'Resposta vazia ao fechar caixa.' }

    if (row.o_ja_fechado) {
      this.caixaId = null
    } else {
      this.caixaId = null
    }

    return {
      ok: true,
      caixaId: String(row.o_caixa_id),
      alreadyClosed: Boolean(row.o_ja_fechado),
    }
  }

  async reopenCaixaIfNeeded(): Promise<void> {
    if (this.caixaId) return
    if (!this.operadorId) throw new Error('operadorId ausente')
    const { data: novo, error } = await this.admin
      .from('caixas')
      .insert({
        operador_id: this.operadorId,
        loja_id: LOJA_MATRIZ_ID,
        valor_inicial: 100,
        status: 'ABERTO',
      })
      .select('id')
      .single()
    if (error || !novo) throw new Error(`Reabrir caixa: ${error?.message}`)
    this.caixaId = novo.id
  }
}
