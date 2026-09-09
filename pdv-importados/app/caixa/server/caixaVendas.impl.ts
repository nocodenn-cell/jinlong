import type { FinalizarVendaCaixaResult } from '@/app/caixa/actions'

// FREEZE: CORE TRANSACIONAL — caller único para finalizar_venda_transacional_canonica_v4.
// Não adicionar branches de execução, flags de feature ou caminhos alternativos aqui.
// Ver docs/venda-golden-flow.md para o contrato oficial.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  finalizarVendaInputSchema,
  roundMoney2,
  descontoDiscricionarioFromItens,
  totaisFromItens,
  totalsMatchDeclared,
} from '@/app/caixa/finalizarVendaValidation'
import type { FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'
import { pagamentoParcialExigeCliente } from '@/app/caixa/caixaPagamentoSaldo'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroDeExcecao, mensagemErroValidacaoZod } from '@/lib/errors/mensagemErroUsuario'
import { caixaErroOperador, idiomaOperadorParaErro } from '@/app/caixa/server/caixaErroOperador'
import { caixaMsgServidor } from '@/app/caixa/server/caixaMensagensServidor'
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
  parsePercentConfig,
} from '@/lib/caixa/configuracoesGeraisCaixa'
import { registrarAlertasLevesVenda } from '@/app/caixa/server/registrarAlertasLevesVenda'
import { perfilPodeCancelarVenda } from '@/app/caixa/server/cancelarVendaPerfil'
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

type RpcCancelarVendaRow = { venda_id?: unknown; valor_estornado?: unknown }

type RpcFinalizarVendaRow = {
  venda_id?: unknown
  status?: unknown
  mensagem?: unknown
  dados_fiscais?: unknown
  itens_atualizados?: unknown
  estoque_baixado?: unknown
  event_id?: unknown
  contas_receber_id?: unknown  // ✅ NOVO (Fase 5b)
}

function firstRpcVendaRow<T>(data: unknown): T | undefined {
  if (data == null) return undefined
  return (Array.isArray(data) ? data[0] : data) as T
}

export async function cancelarVendaImpl(
  vendaId: string,
  motivo: string,
): Promise<
  | { ok: true; vendaId: string; status: 'CANCELADA'; valorEstornado: number }
  | { ok: false; error: string }
> {
  const idioma = await idiomaOperadorParaErro()
  const vendaIdTrim = vendaId.trim()
  const motivoTrim = motivo.trim()

  if (!vendaIdTrim) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_venda_invalida') }
  if (motivoTrim.length < 2) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_motivo_obrigatorio') }
  if (motivoTrim.length > 500) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_motivo_longo') }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }

    const { data: urow } = await supabase
      .from('usuarios')
      .select('perfil')
      .eq('id', user.id)
      .maybeSingle()

    if (!perfilPodeCancelarVenda(urow?.perfil)) {
      // BA-013: SSoT = RPC cancelar_venda_transacional (GERENTE/DONO/ADMIN).
      return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_cancelar_perfil') }
    }

    const { data, error } = await supabase.rpc('cancelar_venda_transacional', {
      p_venda_id: vendaIdTrim,
      p_motivo: motivoTrim,
      p_operador_id: user.id,
    })

    if (error) return { ok: false, error: caixaErroOperador(error.message, await idiomaOperadorParaErro()) }

    const row = firstRpcVendaRow<RpcCancelarVendaRow>(data)
    if (!row?.venda_id) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_cancelamento_sem_id') }

    revalidatePath('/caixa')
    revalidatePath('/admin/vendas')
    revalidatePath('/gerente/vendas')
    revalidatePath(`/gerente/vendas/${vendaIdTrim}`)
    revalidatePath('/gerente/caixas')
    revalidatePath('/gerente/financeiro')

    return {
      ok: true,
      vendaId: String(row.venda_id),
      status: 'CANCELADA',
      valorEstornado: Number(row.valor_estornado ?? 0),
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
      error: mensagemErroDeExcecao(e, caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_cancelar_venda'), await idiomaOperadorParaErro()),
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
  const idioma = await idiomaOperadorParaErro()

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
        error: caixaMsgServidor(idioma, 'err_srv_config_ambiente_invalida'),
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: caixaMsgServidor(idioma, 'err_srv_sessao_expirada') }

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
      // So o desconto discricionario (linhas MANUAL/PROMOCAO) consome a alcada
      // do operador. Preco de atacado e regra comercial cadastrada, ja
      // revalidada contra `calcular_preco_produto` em `recalcularItensNoServidor`.
      const descontoDiscricionario = descontoDiscricionarioFromItens(itensAut)
      const pctLinhas = (descontoDiscricionario / computedBase.totalBruto) * 100

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
        error: caixaMsgServidor(idioma, 'err_srv_carrinho_precos_mudaram'),
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

    if (caixaAbertoErr) {
      return { ok: false, error: caixaErroOperador(caixaAbertoErr.message, await idiomaOperadorParaErro()) }
    }
    if (!caixaExistente) {
      return {
        ok: false,
        error: caixaErroOperador('caixa fechado ao finalizar venda', await idiomaOperadorParaErro()),
      }
    }

    const caixaId = caixaExistente.id

    // ✅ VALIDAÇÃO FASE 5b: Se há saldo pendente, cliente_id é obrigatório
    const somaPagamentos = roundMoney2(input.pagamentos.reduce((acc, p) => acc + p.valor, 0))
    const saldoPendente = roundMoney2(computedFinal.totalLiquido - somaPagamentos)

    if (pagamentoParcialExigeCliente(saldoPendente, input.clienteId)) {
      return {
        ok: false,
        error: caixaMsgServidor(idioma, 'err_srv_pagamento_parcial_cliente'),
      }
    }

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
      p_cliente_id: input.clienteId ?? null,  // ✅ NOVO (Fase 5b)
      p_motivo_desconto: input.motivoDesconto ?? 'NAO_ESPECIFICADO',  // ✅ NOVO (BL-1)
      p_motivo_descricao: input.motivoDescontoDescricao ?? null,  // ✅ NOVO (BL-1)
      p_limite_credito_gerente_token: input.limiteCreditoGerenteToken ?? null,  // BR-01
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

      return { ok: false, error: caixaErroOperador(txErr.message, await idiomaOperadorParaErro()) }
    }

    const row = firstRpcVendaRow<RpcFinalizarVendaRow>(data)

    if (!row?.venda_id) {
      return { ok: false, error: caixaMsgServidor(await idiomaOperadorParaErro(), 'err_srv_concluir') }
    }

    if (row.status !== 'CONCLUIDA') {
      return { ok: false, error: caixaErroOperador(String(row.mensagem ?? ''), await idiomaOperadorParaErro()) }
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
    revalidatePath('/admin/vendas')
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
      contasRecebeId: row.contas_receber_id ? String(row.contas_receber_id) : undefined,  // ✅ NOVO (Fase 5b)
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
      error: caixaErroOperador(e instanceof Error ? e.message : null, await idiomaOperadorParaErro()),
    }
  }
}