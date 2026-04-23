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
import {
  mensagemErroComSecao,
  mensagemErroDeExcecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import { resolveVendaIdForFinalize } from '@/lib/caixa/resolveVendaIdForFinalize'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  enfileirarDocumentoFiscalPosVenda,
  recalcularItensNoServidor,
} from '@/app/caixa/server/caixaActionsInternals'

type PagamentoParcelaRpc = {
  forma_pagamento: FinalizarVendaInput['formaPagamento']
  valor: number
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

    const { data, error } = await supabase.rpc('cancelar_venda_transacional', {
      p_venda_id: vendaIdTrim,
      p_motivo: motivoTrim,
      p_operador_id: user.id,
    })
    if (error) return { ok: false, error: mensagemErroComSecao('Cancelamento de venda', error.message) }

    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row?.venda_id) return { ok: false, error: 'Cancelamento não retornou identificador da venda.' }

    revalidatePath('/caixa')
    revalidatePath('/gerente/vendas')
    revalidatePath(`/gerente/vendas/${vendaIdTrim}`)
    revalidatePath('/gerente/caixas')
    revalidatePath('/gerente/financeiro')
    return { ok: true, vendaId: String(row.venda_id), status: 'CANCELADA' }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível cancelar a venda.'),
    }
  }
}

export async function finalizarVendaCaixaImpl(
  raw: unknown,
): Promise<{ ok: true; vendaId: string } | { ok: false; error: string }> {
  const parsed = finalizarVendaInputSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join('; ')
    const { idioma } = await getUsuarioIdioma()
    return { ok: false, error: mensagemErroValidacaoZod(msg, idioma) }
  }
  const input = parsed.data
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID

    const itensCliente = input.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade }))
    const recalc = await recalcularItensNoServidor(supabase, itensCliente)
    if (!recalc.ok) return { ok: false, error: recalc.error }
    const itensAut = recalc.itens

    const computedBase = totaisFromItens(itensAut)
    const gerentePercentual = input.descontoGerentePercentual ?? null
    const hasDescontoGerente = !!input.descontoGerenteToken && gerentePercentual !== null
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

    // Pré-checagem de estoque (melhor UX; a RPC 016/017 é a fonte de verdade sob concorrência)
    const estoquesInsuficientes: string[] = []
    const produtoIds = Array.from(new Set(itensAut.map((i) => i.produtoId)))
    const { data: estoqueRows, error: estqBatchErr } = await supabase
      .from('estoque')
      .select('produto_id, quantidade_atual, produtos!inner(nome)')
      .eq('loja_id', lojaId)
      .in('produto_id', produtoIds)

    if (estqBatchErr) {
      return {
        ok: false,
        error: mensagemErroComSecao('Estoque', estqBatchErr.message),
      }
    }

    const estoquePorProduto = new Map<
      string,
      { quantidade_atual: number; nome: string }
    >()
    for (const row of estoqueRows ?? []) {
      const pid = row.produto_id as string
      const p = row.produtos as
        | { nome?: string }
        | { nome?: string }[]
        | null
      const nomeProduto =
        (Array.isArray(p) ? p[0]?.nome : p?.nome) ?? 'Produto'
      estoquePorProduto.set(pid, {
        quantidade_atual: Number(row.quantidade_atual ?? 0),
        nome: nomeProduto,
      })
    }

    for (const item of itensAut) {
      const row = estoquePorProduto.get(item.produtoId)
      if (!row) {
        estoquesInsuficientes.push(
          `Produto sem linha de estoque (id ${item.produtoId.slice(0, 8)}…).`,
        )
      } else if (row.quantidade_atual < item.quantidade) {
        estoquesInsuficientes.push(
          `${row.nome}: solicitado ${item.quantidade}, disponível ${row.quantidade_atual}`,
        )
      }
    }

    if (estoquesInsuficientes.length > 0) {
      return {
        ok: false,
        error: `Estoque insuficiente:\n${estoquesInsuficientes.join('\n')}`,
      }
    }

    const { data: caixaExistente, error: caixaAbertoErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (caixaAbertoErr)
      return { ok: false, error: mensagemErroComSecao('Caixa', caixaAbertoErr.message) }
    if (!caixaExistente) {
      return {
        ok: false,
        error: 'Caixa fechado. Abra o caixa antes de finalizar a venda.',
      }
    }
    const caixaId = caixaExistente.id

    const useUnifiedSalesFlow = process.env.USE_UNIFIED_SALES_FLOW === 'true'
    if (!useUnifiedSalesFlow && input.pagamentos.length > 1) {
      return {
        ok: false,
        error:
          'Split de pagamento requer fluxo unificado habilitado no servidor. Ajuste para 1 forma de pagamento.',
      }
    }
    const vendaId = resolveVendaIdForFinalize({
      useUnifiedSalesFlow,
      idempotencyKey: input.idempotencyKey,
      randomUuid: () => crypto.randomUUID(),
    })
    const itensRpc = itensAut.map((i) => ({
      item_id: crypto.randomUUID(),
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      preco_original: roundMoney2(i.precoOriginal),
      preco_unitario: roundMoney2(i.precoUnitario),
      tipo_preco: i.tipoPreco,
    }))

    const strictManagerDiscountAuth = process.env.STRICT_MANAGER_DISCOUNT_AUTH === 'true'
    const rpcName = useUnifiedSalesFlow
      ? 'finalizar_venda_transacional_canonica_v2'
      : 'finalizar_venda_transacional'

    const rpcParams = useUnifiedSalesFlow
      ? {
          p_venda_id: vendaId,
          p_caixa_id: caixaId,
          p_operador_id: user.id,
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
        }
      : {
          p_venda_id: vendaId,
          p_caixa_id: caixaId,
          p_forma_pagamento: input.formaPagamento,
          p_total_bruto: computedFinal.totalBruto,
          p_total_desconto: computedFinal.totalDesconto,
          p_total_liquido: computedFinal.totalLiquido,
          p_itens: itensRpc,
          p_desconto_gerente_token: input.descontoGerenteToken ?? null,
          p_desconto_gerente_percentual: input.descontoGerentePercentual ?? null,
        }

    const { error: txErr } = await supabase.rpc(rpcName, rpcParams)
    if (txErr) return { ok: false, error: mensagemErroComSecao('Finalização da venda', txErr.message) }

    await enfileirarDocumentoFiscalPosVenda(supabase, input, itensAut, {
      vendaId,
      lojaId,
      caixaId,
      operadorId: user.id,
      computedFinal,
    })

    revalidatePath('/gerente/vendas')
    return { ok: true, vendaId }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível finalizar a venda. Tente de novo.'),
    }
  }
}
