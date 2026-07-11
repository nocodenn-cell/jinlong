import type { FinalizarVendaCaixaResult } from '@/app/caixa/actions'

// FREEZE: CORE TRANSACIONAL — caller único para finalizar_venda_transacional_canonica_v4.
// Não adicionar branches de execução, flags de feature ou caminhos alternativos aqui.
// Ver docs/venda-golden-flow.md para o contrato oficial.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  finalizarVendaInputSchema,
  roundMoney2,
  totaisFromItens,
  totalsMatchDeclared,
} from '@/app/caixa/finalizarVendaValidation'
import type { FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroDeExcecao, mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'
import { caixaErroOperador } from '@/app/caixa/server/caixaErroOperador'
import { resolveVendaIdForFinalize } from '@/lib/caixa/resolveVendaIdForFinalize'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  coletarAuditoriaRequest,
  recalcularItensNoServidor,
} from '@/app/caixa/server/caixaActionsInternals'
import { getDeviceFingerprint } from '@/lib/security/deviceFingerprint'
import { getCaixaSalesRuntimeConfig } from '@/lib/config/caixaSalesRuntimeConfig'
import {
  obterMapaConfiguracoesParaCaixaWeb,
  parseMoneyConfig,
  parsePercentConfig,
} from '@/lib/caixa/configuracoesGeraisCaixa'
import { registrarAlertasLevesVenda } from '@/app/caixa/server/registrarAlertasLevesVenda'
import {
  captureVendaError,
  captureRpcVendaError,
  captureMessage,
  VENDA_EVENTS,
} from '@/lib/sentry/vendaSentry'

type PagamentoParcelaRpc = {
  forma_pagamento: FinalizarVendaInput['formaPagamento']
  valor: number
}

type RpcCancelarVendaRow = { venda_id?: unknown }

type RpcFinalizarVendaRow = {
  venda_id?: unknown
  status?: unknown
  mensagem?: unknown
  dados_fiscais?: unknown
  itens_atualizados?: unknown
  estoque_baixado?: unknown
  event_id?: unknown
}

function firstRpcVendaRow<T>(data: unknown): T | undefined {
  if (data == null) return undefined
  return (Array.isArray(data) ? data[0] : data) as T
}

export async function cancelarVendaImpl(
  vendaId: string,
  motivo: string,
): Promise<
  | { ok: true; vendaId: string; status: 'CANCELADA' }
  | { ok: false; error: string }
> {
  const vendaIdTrim = vendaId.trim()
  const motivoTrim = motivo.trim()

  if (!vendaIdTrim) return { ok: false, error: 'Venda inválida.' }
  if (motivoTrim.length < 2) return { ok: false, error: 'Motivo obrigatório (mín. 2 caracteres).' }
  if (motivoTrim.length > 500) return { ok: false, error: 'Motivo muito longo (máx. 500 caracteres).' }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data: urow } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', user.id)
      .maybeSingle()

    if (urow?.perfil === 'OPERADOR') {
      const [{ data: vrow }, cfgMap] = await Promise.all([
        supabase.from('vendas').select('total_liquido').eq('id', vendaIdTrim).maybeSingle(),
        obterMapaConfiguracoesParaCaixaWeb(supabase),
      ])

      const totalLiq = Number(vrow?.total_liquido ?? 0)
      const maxCancel = parseMoneyConfig(cfgMap.cancelamento_maximo_valor_sem_gerente, 500)

      if (Number.isFinite(totalLiq) && totalLiq > maxCancel + 0.01) {
        return {
          ok: false,
          error: `Cancelamento não permitido: valor da venda (R$ ${totalLiq.toFixed(2)}) ultrapassa o limite do operador (R$ ${maxCancel.toFixed(2)}).`,
        }
      }
    }

    const { data, error } = await supabase.rpc('cancelar_venda_transacional', {
      p_venda_id: vendaIdTrim,
      p_motivo: motivoTrim,
      p_operador_id: user.id,
    })

    if (error) return { ok: false, error: caixaErroOperador(error.message) }

    const row = firstRpcVendaRow<RpcCancelarVendaRow>(data)
    if (!row?.venda_id) return { ok: false, error: 'Cancelamento não retornou identificador da venda.' }

    revalidatePath('/caixa')
    revalidatePath('/gerente/vendas')
    revalidatePath(`/gerente/vendas/${vendaIdTrim}`)
    revalidatePath('/gerente/caixas')
    revalidatePath('/gerente/financeiro')

    return {
      ok: true,
      vendaId: String(row.venda_id),
      status: 'CANCELADA',
    }
  } catch (e) {
    captureVendaError(e, {
      trace_id: vendaIdTrim,
      venda_id: vendaIdTrim,
      plataforma: 'web',
      evento: VENDA_EVENTS.VENDA_CANCELADA,
      extra: { motivo_len: motivoTrim.length },
    })

    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível cancelar a venda.'),
    }
  }
}

export async function finalizarVendaCaixaImpl(
  raw: unknown,
): Promise<FinalizarVendaCaixaResult> {
  const parsed = finalizarVendaInputSchema.safeParse(raw)

  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { ok: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }

  const input = parsed.data

  try {
    const runtimeCfg = getCaixaSalesRuntimeConfig()

    if (runtimeCfg.hasInvalidFlags) {
      captureMessage('[caixa.finalizar_venda.flag_invalida]', {
        level: 'error',
        extra: {
          invalidFlags: runtimeCfg.invalidFlags,
          source: runtimeCfg.source,
        },
      })

      return {
        ok: false,
        error:
          'Configuração de ambiente inválida para finalização de venda. Revise USE_UNIFIED_SALES_FLOW, STRICT_MANAGER_DISCOUNT_AUTH e AUTO_ENQUEUE_FISCAL_ON_SALE.',
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID

    const itensCliente = input.itens.map((i) => ({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      precoOriginal: i.precoOriginal,
      precoUnitario: i.precoUnitario,
      tipoPreco: i.tipoPreco,
    }))

    const recalc = await recalcularItensNoServidor(supabase, itensCliente, lojaId)
    if (!recalc.ok) return { ok: false, error: recalc.error }

    const itensAut = recalc.itens
    const pricingVersionId = recalc.pricingVersionId

    const computedBase = totaisFromItens(itensAut)
    const gerentePercentual = input.descontoGerentePercentual ?? null
    const hasDescontoGerente = !!input.descontoGerenteToken && gerentePercentual !== null

    if (!hasDescontoGerente && computedBase.totalBruto > 0.009) {
      const cfgMap = await obterMapaConfiguracoesParaCaixaWeb(supabase)
      const maxPctOp = parsePercentConfig(cfgMap.desconto_maximo_operador_percentual, 10)
      const pctLinhas = (computedBase.totalDesconto / computedBase.totalBruto) * 100

      if (pctLinhas > maxPctOp + 0.05) {
        return {
          ok: false,
          error: `O desconto total na venda (${pctLinhas.toFixed(1)}%) ultrapassa o máximo permitido sem validação de gerente (${maxPctOp}%). Solicite aprovação do gerente.`,
        }
      }
    }

    const descontoGerenteValor = hasDescontoGerente
      ? roundMoney2((computedBase.totalLiquido * gerentePercentual) / 100)
      : 0

    const computedFinal = {
      totalBruto: computedBase.totalBruto,
      totalDesconto: roundMoney2(computedBase.totalDesconto + descontoGerenteValor),
      totalLiquido: roundMoney2(computedBase.totalLiquido - descontoGerenteValor),
    }

    if (!totalsMatchDeclared(computedFinal, input)) {
      return {
        ok: false,
        error:
          'Os preços/regras do carrinho mudaram. Reabra o caixa e tente novamente para recalcular.',
      }
    }

    // Verificar caixa aberto
    const { data: caixaExistente, error: caixaAbertoErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (caixaAbertoErr) return { ok: false, error: caixaErroOperador(caixaAbertoErr.message) }
    if (!caixaExistente) {
      return { ok: false, error: 'Caixa fechado. Abra o caixa antes de finalizar a venda.' }
    }

    const caixaId = caixaExistente.id

    const vendaId = resolveVendaIdForFinalize({
      idempotencyKey: input.idempotencyKey,
      randomUuid: () => crypto.randomUUID(),
    })

    // Preparar itens para RPC
    const itensRpc = itensAut.map((i) => ({
      item_id: crypto.randomUUID(),
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      preco_original: roundMoney2(i.precoOriginal),
      preco_unitario: roundMoney2(i.precoUnitario),
      desconto_unitario: roundMoney2(i.descontoUnitario),
      tipo_preco: i.tipoPreco,
      custo_unitario_snap: i.custoUnitarioSnap,
      tipo_preco_fonte: i.fontePreco,
      regra_aplicada_id: i.regraAplicadaId,
    }))

    // Coletar dados de auditoria
    const { ipAddress, userAgent } = await coletarAuditoriaRequest()

    const strictManagerDiscountAuth = runtimeCfg.strictManagerDiscountAuth
    const _rpcStart = Date.now()

    const { data, error: txErr } = await supabase.rpc('finalizar_venda_transacional_canonica_v4', {
      p_venda_id: vendaId,
      p_caixa_id: caixaId,
      p_operador_id: user.id,
      p_loja_id: lojaId,
      p_forma_pagamento: input.formaPagamento,
      p_total_bruto: computedFinal.totalBruto,
      p_total_desconto: computedFinal.totalDesconto,
      p_total_liquido: computedFinal.totalLiquido,
      p_pagamentos: input.pagamentos.map(
        (p): PagamentoParcelaRpc => ({
          forma_pagamento: p.formaPagamento,
          valor: roundMoney2(p.valor),
        }),
      ),
      p_itens: itensRpc,
      p_desconto_gerente_token: input.descontoGerenteToken ?? null,
      p_desconto_gerente_percentual: input.descontoGerentePercentual ?? null,
      p_strict_manager_discount_auth: strictManagerDiscountAuth,
      p_fiscal_auto_enqueue: runtimeCfg.autoEnqueueFiscalOnSale,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_device_id: getDeviceFingerprint(),
      p_terminal_id: 'web-caixa',
      p_cliente_id: input.clienteId ?? null,
    })

    if (txErr) {
      const _elapsed = Date.now() - _rpcStart

      captureMessage('[caixa.finalizar_venda.rpc_error]', {
        level: 'error',
        extra: {
          vendaId,
          usuarioId: user.id,
          lojaId,
          totalLiquido: computedFinal.totalLiquido,
          itensCount: itensAut.length,
          erro: txErr.message,
          strictManagerDiscountAuth: runtimeCfg.strictManagerDiscountAuth,
          elapsed_ms: _elapsed,
        },
      })

      captureRpcVendaError(txErr.message, {
        trace_id: input.idempotencyKey ?? vendaId,
        venda_id: vendaId,
        caixa_id: caixaId,
        operador_id: user.id,
        loja_id: lojaId,
        total_liquido: computedFinal.totalLiquido,
        itens_count: itensAut.length,
        plataforma: 'web',
        rpc: 'finalizar_venda_transacional_canonica_v4',
        elapsed_ms: _elapsed,
      })

      return { ok: false, error: caixaErroOperador(txErr.message) }
    }

    const row = firstRpcVendaRow<RpcFinalizarVendaRow>(data)

    if (!row?.venda_id) {
      return { ok: false, error: 'Não foi possível concluir. Tente novamente.' }
    }

    if (row.status !== 'CONCLUIDA') {
      return { ok: false, error: caixaErroOperador(String(row.mensagem ?? '')) }
    }

    const eventId = row.event_id ? String(row.event_id) : String(row.venda_id ?? vendaId)

    captureMessage('[caixa.finalizar_venda.sucesso]', {
      level: 'info',
      extra: {
        vendaId: String(row.venda_id),
        eventId,
        usuarioId: user.id,
        lojaId,
        totalLiquido: computedFinal.totalLiquido,
        itensCount: itensAut.length,
        temDescontoGerente: !!input.descontoGerenteToken,
        elapsed_ms: Date.now() - _rpcStart,
      },
    })

    // Registrar versão de pricing na venda (migration 249)
    if (pricingVersionId) {
      supabase
        .rpc('registrar_pricing_version_venda', {
          p_venda_id: String(row.venda_id),
          p_version_id: pricingVersionId,
        })
        .then(({ error: vErr }) => {
          if (vErr) {
            captureMessage('[caixa.finalizar_venda.pricing_version_nao_registrada]', {
              level: 'warning',
              extra: {
                vendaId: row.venda_id,
                pricingVersionId,
                error: vErr.message,
              },
            })
          }
        })
    }

    await registrarAlertasLevesVenda(supabase, String(row.venda_id), lojaId, itensAut)

    revalidatePath('/caixa')
    revalidatePath('/gerente/vendas')
    revalidatePath('/gerente/caixas')
    revalidatePath('/gerente/financeiro')

    return {
      ok: true,
      vendaId: String(row.venda_id),
      eventId,
      documentoFiscal: row.dados_fiscais,
      itensAtualizados: row.itens_atualizados,
      estoqueBaixado: row.estoque_baixado,
    }
  } catch (e) {
    captureMessage('[caixa.finalizar_venda.excecao_nao_tratada]', {
      level: 'error',
      extra: {
        erro: e instanceof Error ? e.message : String(e),
      },
    })

    captureVendaError(e, {
      trace_id:
        typeof input === 'object' &&
        input !== null &&
        'idempotencyKey' in input &&
        input.idempotencyKey
          ? String(input.idempotencyKey)
          : 'unknown',
      plataforma: 'web',
      evento: VENDA_EVENTS.ERRO_RPC_VENDA,
      extra: { layer: 'finalizarVendaCaixaImpl', excecao_nao_tratada: true },
    })

    return {
      ok: false,
      error: caixaErroOperador(e instanceof Error ? e.message : null),
    }
  }
}