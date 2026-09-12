'use server'

import { createClient } from '@/lib/supabase/server'
import type {
  EscopoFormaPagamento,
  FormaPagamentoCatalogo,
} from '@shared-core/src/financial'

/**
 * Catálogo de formas de pagamento — a fonte única das telas financeiras.
 *
 * O que isto corrige: Contas a Receber e Contas a Pagar mantinham, cada uma,
 * um array literal com formas **diferentes e incompatíveis** (`CARTAO_DEBITO`
 * de um lado, `CARTAO` do outro), enquanto `formas_pagamento` — com
 * `taxa_percentual` e `prazo_compensacao_dias` já modelados — não era lida em
 * lugar nenhum do produto.
 *
 * `escopo` decide o que cada tela oferece: receber um título não aceita boleto,
 * pagar um fornecedor não usa "outros". Unificar a FONTE não é uniformizar a
 * OFERTA.
 *
 * **Fallback deliberado.** Se a leitura falhar, devolve o conjunto canônico em
 * vez de lista vazia. Um catálogo indisponível não pode impedir alguém de
 * registrar um pagamento: o CHECK do banco continua sendo a autoridade sobre o
 * que entra, então o pior caso do fallback é oferecer uma forma que o banco
 * recusa — nunca gravar algo inválido.
 */

const CANONICO: Readonly<Record<EscopoFormaPagamento, FormaPagamentoCatalogo[]>> = {
  RECEBER: [
    { codigo: 'DINHEIRO', nome: 'Dinheiro', escopo: 'AMBOS', taxaPercentual: 0, prazoCompensacaoDias: 0 },
    { codigo: 'PIX', nome: 'Pix', escopo: 'AMBOS', taxaPercentual: 0, prazoCompensacaoDias: 0 },
    { codigo: 'CARTAO_DEBITO', nome: 'Cartão de Débito', escopo: 'AMBOS', taxaPercentual: 0, prazoCompensacaoDias: 0 },
    { codigo: 'CARTAO_CREDITO', nome: 'Cartão de Crédito', escopo: 'AMBOS', taxaPercentual: 0, prazoCompensacaoDias: 0 },
    { codigo: 'OUTROS', nome: 'Outros', escopo: 'RECEBER', taxaPercentual: 0, prazoCompensacaoDias: 0 },
  ],
  PAGAR: [
    { codigo: 'DINHEIRO', nome: 'Dinheiro', escopo: 'AMBOS', taxaPercentual: 0, prazoCompensacaoDias: 0 },
    { codigo: 'PIX', nome: 'Pix', escopo: 'AMBOS', taxaPercentual: 0, prazoCompensacaoDias: 0 },
    { codigo: 'CARTAO_DEBITO', nome: 'Cartão de Débito', escopo: 'AMBOS', taxaPercentual: 0, prazoCompensacaoDias: 0 },
    { codigo: 'CARTAO_CREDITO', nome: 'Cartão de Crédito', escopo: 'AMBOS', taxaPercentual: 0, prazoCompensacaoDias: 0 },
    { codigo: 'BOLETO', nome: 'Boleto', escopo: 'PAGAR', taxaPercentual: 0, prazoCompensacaoDias: 0 },
    { codigo: 'TRANSF', nome: 'Transferência', escopo: 'PAGAR', taxaPercentual: 0, prazoCompensacaoDias: 0 },
  ],
  AMBOS: [],
}

/** Ordem estável na tela: dinheiro e pix primeiro, o resto como cadastrado. */
const PESO: Readonly<Record<string, number>> = {
  DINHEIRO: 0,
  PIX: 1,
  CARTAO_DEBITO: 2,
  CARTAO_CREDITO: 3,
}

function ordenar(formas: FormaPagamentoCatalogo[]): FormaPagamentoCatalogo[] {
  return [...formas].sort(
    (a, b) => (PESO[a.codigo] ?? 90) - (PESO[b.codigo] ?? 90) || a.codigo.localeCompare(b.codigo),
  )
}

export async function listarFormasPagamento(
  escopo: 'RECEBER' | 'PAGAR',
): Promise<FormaPagamentoCatalogo[]> {
  const fallback = ordenar(CANONICO[escopo])
  try {
    const supabase = await createClient()
    // RLS já escopa por loja; `ativo` deixa o dono desligar uma forma sem
    // apagá-la, preservando o histórico que aponta para ela.
    const { data, error } = await supabase
      .from('formas_pagamento')
      .select('codigo, nome, escopo, taxa_percentual, prazo_compensacao_dias')
      .eq('ativo', true)
      .in('escopo', [escopo, 'AMBOS'])

    if (error || !data || data.length === 0) return fallback

    return ordenar(
      data.map((f) => ({
        codigo: String(f.codigo),
        nome: String(f.nome),
        escopo: f.escopo as EscopoFormaPagamento,
        taxaPercentual: Number(f.taxa_percentual ?? 0),
        prazoCompensacaoDias: Number(f.prazo_compensacao_dias ?? 0),
      })),
    )
  } catch {
    return fallback
  }
}
