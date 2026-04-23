import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroComSecao, mensagemErroDeExcecao } from '@/lib/errors/mensagemErroUsuario'
import type {
  AbrirCaixaOperadorResult,
  CaixaStatusOperadorResult,
  FecharCaixaOperadorResult,
} from '@/app/caixa/caixaOperadorTypes'
import {
  calcularValorSistemaDinheiroCaixa,
  fetchPdvConfigParaCaixaWeb,
  LIMITE_DIVERGENCIA_FECHAMENTO,
  parseMoneyInput,
} from '@/app/caixa/server/caixaActionsInternals'

export async function obterStatusCaixaOperadorImpl(): Promise<CaixaStatusOperadorResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data: caixaAberto, error } = await supabase
      .from('caixas')
      .select('id, data_abertura, valor_inicial')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return { ok: false, error: mensagemErroComSecao('Caixa', error.message) }
    if (!caixaAberto) return { ok: true, aberto: false }

    const valorSistemaDinheiro = await calcularValorSistemaDinheiroCaixa(supabase, caixaAberto.id)
    const cfgRes = await fetchPdvConfigParaCaixaWeb(supabase)
    if (!cfgRes.ok) {
      return { ok: false, error: mensagemErroComSecao('Configuração PDV', cfgRes.error) }
    }
    return {
      ok: true,
      aberto: true,
      caixaId: caixaAberto.id,
      dataAbertura: caixaAberto.data_abertura,
      valorInicial: Number(caixaAberto.valor_inicial ?? 0),
      valorSistemaDinheiro,
      blindClosureEnabled: Boolean(cfgRes.row?.blind_closure),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível consultar o status do caixa.'),
    }
  }
}

export async function abrirCaixaOperadorImpl(valorInicial: number): Promise<AbrirCaixaOperadorResult> {
  const valorInicialSanitizado = parseMoneyInput(valorInicial)
  if (valorInicialSanitizado === null) {
    return { ok: false, error: 'Valor inicial inválido.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data: caixaAberto, error: caixaAbertoErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (caixaAbertoErr)
      return { ok: false, error: mensagemErroComSecao('Caixa', caixaAbertoErr.message) }
    if (caixaAberto) return { ok: false, error: 'Já existe um caixa aberto para este operador.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID
    const { data: novo, error: insertErr } = await supabase
      .from('caixas')
      .insert({
        operador_id: user.id,
        loja_id: lojaId,
        valor_inicial: valorInicialSanitizado,
        status: 'ABERTO',
      })
      .select('id')
      .single()

    if (insertErr) return { ok: false, error: mensagemErroComSecao('Caixa', insertErr.message) }
    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    return { ok: true, caixaId: novo.id }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível abrir o caixa. Tente de novo.'),
    }
  }
}

export async function fecharCaixaOperadorImpl(input: {
  valorContado: number
  motivo?: string
}): Promise<FecharCaixaOperadorResult> {
  const valorContado = parseMoneyInput(input.valorContado)
  if (valorContado === null) return { ok: false, error: 'Valor contado inválido.' }
  const motivo = (input.motivo ?? '').trim()
  if (motivo.length > 500) {
    return { ok: false, error: 'Motivo muito longo (máx. 500 caracteres).' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data: caixaAberto, error: caixaErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (caixaErr) return { ok: false, error: mensagemErroComSecao('Caixa', caixaErr.message) }
    if (!caixaAberto) return { ok: false, error: 'Não há caixa aberto para fechar.' }

    const valorSistemaDinheiro = await calcularValorSistemaDinheiroCaixa(supabase, caixaAberto.id)
    const diferenca = roundMoney2(valorContado - valorSistemaDinheiro)
    if (Math.abs(diferenca) > LIMITE_DIVERGENCIA_FECHAMENTO && motivo.length < 5) {
      return {
        ok: false,
        error: `Diferença acima de R$ ${LIMITE_DIVERGENCIA_FECHAMENTO.toFixed(2)} exige motivo (mín. 5 caracteres).`,
      }
    }

    const { error: updateErr } = await supabase
      .from('caixas')
      .update({
        status: 'FECHADO',
        data_fechamento: new Date().toISOString(),
        valor_fechamento: valorContado,
        fechamento_diferenca: diferenca,
        fechamento_observacao: motivo || null,
      })
      .eq('id', caixaAberto.id)

    if (updateErr) return { ok: false, error: mensagemErroComSecao('Caixa', updateErr.message) }

    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    revalidatePath('/gerente/vendas')
    return {
      ok: true,
      caixaId: caixaAberto.id,
      valorSistemaDinheiro,
      valorContado,
      diferenca,
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível fechar o caixa. Tente de novo.'),
    }
  }
}
