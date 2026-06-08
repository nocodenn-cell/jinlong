'use server'

import { createClient } from '@/lib/supabase/server'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { DEMO_FLUXO_PRODUTO_CODIGO } from '@/lib/demo/isDemoFluxoEnabled'
import { executarFluxoDemoServer } from '@/app/demo-fluxo/executarFluxoDemoServer'
import { PDVContext, runPdvEvaluation, type PdvEvaluationOutcome } from '@/lib/pdv'

export type DemoPreRequisito = {
  id: string
  label: string
  ok: boolean
  detail: string
}

export type DemoContextoInicial = {
  ok: boolean
  preRequisitos: DemoPreRequisito[]
  lojaNome: string | null
  operadorNome: string | null
  operadorPerfil: string | null
  produtoNome: string | null
  produtoId: string | null
  estoqueAtual: number | null
  caixaAberto: boolean
  caixaId: string | null
  error?: string
}

export type DemoFluxoE2EResult = {
  fluxoOk: boolean
  fluxoError?: string
  steps: import('@/app/demo-fluxo/executarFluxoDemoServer').DemoFluxoStepResult[]
  outcome: PdvEvaluationOutcome | null
  readBack: DemoResultadoPosFluxo | null
}

export type DemoResultadoPosFluxo = {
  venda: {
    id: string
    status: string | null
    total_liquido: number | null
    forma_pagamento: string | null
    data: string | null
  } | null
  caixa: {
    id: string
    status: string
    valor_fechamento: number | null
    fechamento_diferenca: number | null
    data_fechamento: string | null
  } | null
  estoqueAntes: number | null
  estoqueDepois: number | null
  produtoNome: string | null
  error?: string
}

export async function obterContextoDemoFluxo(): Promise<DemoContextoInicial> {
  const preRequisitos: DemoPreRequisito[] = []

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return {
        ok: false,
        preRequisitos: [
          { id: 'sessao', label: 'Sessão autenticada', ok: false, detail: 'Faça login como operador.' },
        ],
        lojaNome: null,
        operadorNome: null,
        operadorPerfil: null,
        produtoNome: null,
        produtoId: null,
        estoqueAtual: null,
        caixaAberto: false,
        caixaId: null,
        error: 'Sessão expirada.',
      }
    }

    const { data: loja } = await supabase
      .from('lojas')
      .select('id, nome')
      .eq('id', LOJA_MATRIZ_ID)
      .maybeSingle()

    preRequisitos.push({
      id: 'loja',
      label: '1 loja (Matriz)',
      ok: !!loja,
      detail: loja?.nome ?? `UUID ${LOJA_MATRIZ_ID}`,
    })

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('nome, perfil, loja_id')
      .eq('id', user.id)
      .maybeSingle()

    const perfilOk = usuario?.perfil === 'OPERADOR' || usuario?.perfil === 'GERENTE' || usuario?.perfil === 'DONO'
    preRequisitos.push({
      id: 'operador',
      label: '1 operador (sessão atual)',
      ok: !!usuario && perfilOk,
      detail: usuario ? `${usuario.nome} (${usuario.perfil})` : 'Sem linha em usuarios — rode seed:dev-users',
    })

    const { data: produto } = await supabase
      .from('produtos')
      .select('id, nome, codigo_barras, ativo')
      .eq('codigo_barras', DEMO_FLUXO_PRODUTO_CODIGO)
      .maybeSingle()

    preRequisitos.push({
      id: 'produto',
      label: 'Produto demo no catálogo',
      ok: !!produto?.ativo,
      detail: produto?.nome ?? `Código ${DEMO_FLUXO_PRODUTO_CODIGO} (migration 027)`,
    })

    let estoqueAtual: number | null = null
    if (produto?.id) {
      const { data: est } = await supabase
        .from('estoque')
        .select('quantidade_atual')
        .eq('produto_id', produto.id)
        .maybeSingle()
      estoqueAtual = est?.quantidade_atual != null ? Number(est.quantidade_atual) : null
    }

    preRequisitos.push({
      id: 'estoque',
      label: 'Estoque do produto demo',
      ok: estoqueAtual != null && estoqueAtual >= 1,
      detail: estoqueAtual != null ? `${estoqueAtual} un.` : 'Sem linha em estoque',
    })

    const { data: caixaAberto } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    preRequisitos.push({
      id: 'caixa',
      label: 'Caixa aberto',
      ok: !!caixaAberto,
      detail: caixaAberto
        ? `Aberto (${caixaAberto.id.slice(0, 8)}…)`
        : 'Será aberto automaticamente no passo 1 do fluxo',
    })

    const ok = preRequisitos.every((p) => p.id === 'caixa' || p.ok)

    return {
      ok,
      preRequisitos,
      lojaNome: loja?.nome ?? null,
      operadorNome: usuario?.nome ?? null,
      operadorPerfil: usuario?.perfil ?? null,
      produtoNome: produto?.nome ?? null,
      produtoId: produto?.id ?? null,
      estoqueAtual,
      caixaAberto: !!caixaAberto,
      caixaId: caixaAberto?.id ?? null,
    }
  } catch (e) {
    return {
      ok: false,
      preRequisitos,
      lojaNome: null,
      operadorNome: null,
      operadorPerfil: null,
      produtoNome: null,
      produtoId: null,
      estoqueAtual: null,
      caixaAberto: false,
      caixaId: null,
      error: e instanceof Error ? e.message : 'Erro ao carregar contexto demo.',
    }
  }
}

export async function obterResultadosDemoFluxo(input: {
  vendaId: string
  produtoId: string
  estoqueAntes: number | null
}): Promise<DemoResultadoPosFluxo> {
  try {
    const supabase = await createClient()

    const [{ data: venda }, { data: produto }, { data: estoque }] = await Promise.all([
      supabase
        .from('vendas')
        .select('id, status, total_liquido, forma_pagamento, data, caixa_id')
        .eq('id', input.vendaId)
        .maybeSingle(),
      supabase.from('produtos').select('nome').eq('id', input.produtoId).maybeSingle(),
      supabase
        .from('estoque')
        .select('quantidade_atual')
        .eq('produto_id', input.produtoId)
        .maybeSingle(),
    ])

    let caixaRow: DemoResultadoPosFluxo['caixa'] = null
    if (venda?.caixa_id) {
      const { data: cx } = await supabase
        .from('caixas')
        .select('id, status, valor_fechamento, fechamento_diferenca, data_fechamento')
        .eq('id', venda.caixa_id)
        .maybeSingle()
      if (cx) {
        caixaRow = {
          id: cx.id,
          status: cx.status,
          valor_fechamento: cx.valor_fechamento != null ? Number(cx.valor_fechamento) : null,
          fechamento_diferenca:
            cx.fechamento_diferenca != null ? Number(cx.fechamento_diferenca) : null,
          data_fechamento: cx.data_fechamento,
        }
      }
    }

    return {
      venda: venda
        ? {
            id: venda.id,
            status: venda.status,
            total_liquido: venda.total_liquido != null ? Number(venda.total_liquido) : null,
            forma_pagamento: venda.forma_pagamento,
            data: venda.data,
          }
        : null,
      caixa: caixaRow,
      estoqueAntes: input.estoqueAntes,
      estoqueDepois: estoque?.quantidade_atual != null ? Number(estoque.quantidade_atual) : null,
      produtoNome: produto?.nome ?? null,
    }
  } catch (e) {
    return {
      venda: null,
      caixa: null,
      estoqueAntes: input.estoqueAntes,
      estoqueDepois: null,
      produtoNome: null,
      error: e instanceof Error ? e.message : 'Erro ao carregar resultados.',
    }
  }
}

export async function executarDemoFluxoE2E(input: {
  produtoId: string | null
  estoqueAtual: number | null
}): Promise<DemoFluxoE2EResult> {
  const fluxo = await executarFluxoDemoServer(input)

  if (!fluxo.ok) {
    return {
      fluxoOk: false,
      fluxoError: fluxo.error,
      steps: fluxo.steps,
      outcome: null,
      readBack: null,
    }
  }

  const outcome = await runPdvEvaluation(fluxo.caixaId, PDVContext.DEMO_FLOW)

  const readBack = await obterResultadosDemoFluxo({
    vendaId: fluxo.vendaId,
    produtoId: fluxo.produtoId,
    estoqueAntes: fluxo.estoqueAntes,
  })

  return {
    fluxoOk: true,
    steps: fluxo.steps,
    outcome,
    readBack,
  }
}
