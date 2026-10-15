/** Defaults de PDV para loja recém-provisionada (sem NFC-e obrigatória). */

export const PDV_CONFIG_DEFAULTS = {
  cfop_padrao: '5102',
  cst_padrao: '00',
  regime_tributario: 'SIMPLES_NACIONAL' as const,
  auto_enqueue_fiscal: false,
  tema_padrao: 'noturno' as const,
  imprimir_cupom_auto: true,
  formato_impressao: 'TERMICA' as const,
}

/**
 * Formas de pagamento padrão de uma loja nova — as mesmas que a migration 302
 * (`formas_pagamento` parametrizável) semeou para as lojas que já existiam.
 * A RPC canônica de venda (chamada só por `caixaVendas.impl.ts`) aceita apenas forma ativa cadastrada
 * PARA A LOJA da venda; sem estas linhas, nenhuma venda de loja provisionada
 * pelo wizard passava (`FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA`).
 */
export const FORMAS_PAGAMENTO_PADRAO: readonly { codigo: string; nome: string }[] = [
  { codigo: 'DINHEIRO', nome: 'Dinheiro' },
  { codigo: 'PIX', nome: 'Pix' },
  { codigo: 'CARTAO_DEBITO', nome: 'Cartão de Débito' },
  { codigo: 'CARTAO_CREDITO', nome: 'Cartão de Crédito' },
]

export function linhasFormasPagamentoPadrao(lojaId: string) {
  return FORMAS_PAGAMENTO_PADRAO.map((f) => ({ loja_id: lojaId, codigo: f.codigo, nome: f.nome }))
}

/** Itens do checklist marcados ao concluir o wizard. */
export const CHECKLIST_ITENS_POS_PROVISION: readonly string[] = [
  'loja.criada',
  'loja.pdv',
  'usuarios.dono',
]

export function slugCodigoLoja(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
  return base.length >= 2 ? base : `LOJA_${Date.now().toString(36).toUpperCase()}`
}
