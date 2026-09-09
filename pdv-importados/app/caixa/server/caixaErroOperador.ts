import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'

type IdiomaErro = 'pt' | 'zh'

function idiomaSeguro(idioma?: string): IdiomaErro {
  if (idioma === 'zh') return idioma
  return 'pt'
}

/**
 * Idioma do operador para mensagens de erro do caixa, sem nunca lançar: se a
 * sessão já caiu (é exatamente o cenário de erro que estamos tratando), cai
 * em `undefined` e `caixaErroOperador`/`caixaErroOperador` usa o default 'pt'
 * — comportamento idêntico ao anterior, nunca uma falha nova no path de erro.
 */
export async function idiomaOperadorParaErro(): Promise<string | undefined> {
  try {
    const { idioma } = await getUsuarioIdioma()
    return idioma
  } catch {
    return undefined
  }
}

const MSG_PADRAO: Record<IdiomaErro, string> = {
  pt: 'Não foi possível concluir. Tente novamente.',
  zh: '当前无法完成该操作。请稍后再试。',
}
const MSG_CAIXA_INDISPONIVEL: Record<IdiomaErro, string> = {
  pt: 'Caixa indisponível no momento.',
  zh: '收银台暂时不可用。',
}
const MSG_MOVIMENTACOES_PENDENTES: Record<IdiomaErro, string> = {
  pt: 'Há movimentações de caixa pendentes. Resolva as pendências antes de fechar.',
  zh: '有待完成的销售。',
}
const MSG_CAIXA_FECHADO: Record<IdiomaErro, string> = {
  pt: 'Caixa fechado. Abra o caixa antes de finalizar a venda.',
  zh: '收银台已关闭。请先开启收银台再完成销售。',
}
const MSG_NAO_HA_CAIXA_ABERTO: Record<IdiomaErro, string> = {
  pt: 'Não há caixa aberto para fechar.',
  zh: '没有已开启的收银台可关闭。',
}
const MSG_SESSAO: Record<IdiomaErro, string> = {
  pt: 'Sessão expirada. Faça login novamente.',
  zh: '会话已过期，请重新登录。',
}
const MSG_ESTOQUE: Record<IdiomaErro, string> = {
  pt: 'Estoque insuficiente para um ou mais itens. Ajuste o carrinho e tente novamente.',
  zh: '一个或多个商品库存不足。请调整购物车后重试。',
}
const MSG_PRECO: Record<IdiomaErro, string> = {
  pt: 'Os preços do carrinho mudaram. Atualize as quantidades e finalize novamente.',
  zh: '购物车中的价格已变更。请更新数量后重新完成销售。',
}
const MSG_PAGAMENTO: Record<IdiomaErro, string> = {
  pt: 'Pagamento inválido ou divergente do total. Revise as formas de pagamento.',
  zh: '付款无效或与总额不符。请检查付款方式。',
}
const MSG_CLIENTE_SALDO: Record<IdiomaErro, string> = {
  pt: 'Pagamento parcial exige um cliente válido da loja.',
  zh: '部分付款（挂账）需要绑定有效的门店客户。',
}
const MSG_LIMITE_CREDITO: Record<IdiomaErro, string> = {
  pt: 'Venda excede o limite de crédito do cliente — autorização do gerente necessária.',
  zh: '销售超过客户信用额度 — 需要经理授权。',
}

function lower(raw: string): string {
  return raw.toLowerCase()
}

/** Boundary operador: nunca expõe rpcErr, SQL, migrations ou códigos internos. */
export function caixaErroOperador(
  detalheTecnico: string | undefined | null,
  idiomaInput?: string,
): string {
  const idioma = idiomaSeguro(idiomaInput)
  const raw = (detalheTecnico ?? '').trim()
  if (!raw) return MSG_PADRAO[idioma]

  const l = lower(raw)

  if (l.includes('sessão expirada') || l.includes('sessao expirada') || l.includes('jwt')) {
    return MSG_SESSAO[idioma]
  }
  if (l.includes('fechar_caixa_movimentacoes_pendentes') || (l.includes('movimentação') && l.includes('pendente'))) {
    return MSG_MOVIMENTACOES_PENDENTES[idioma]
  }
  if (l.includes('caixa fechado') || l.includes('não há caixa aberto') || l.includes('nao ha caixa aberto')) {
    return l.includes('finalizar') ? MSG_CAIXA_FECHADO[idioma] : MSG_NAO_HA_CAIXA_ABERTO[idioma]
  }
  if (l.includes('finalizar_venda_canonica_estoque') || l.includes('estoque insuficiente')) {
    return MSG_ESTOQUE[idioma]
  }
  if (
    l.includes('preco_divergente') ||
    l.includes('tipo_preco_divergente') ||
    l.includes('preco_nao_validado') ||
    l.includes('totais_divergentes')
  ) {
    return MSG_PRECO[idioma]
  }
  if (
    l.includes('pagamentos_divergentes') ||
    l.includes('pagamentos_excedem_total') ||
    l.includes('pagamento_zero') ||
    l.includes('forma_pagamento_invalida') ||
    l.includes('valor_pagamento_invalido')
  ) {
    return MSG_PAGAMENTO[idioma]
  }
  if (
    l.includes('saldo_pendente_exige_cliente') ||
    l.includes('cliente_loja_invalido')
  ) {
    return MSG_CLIENTE_SALDO[idioma]
  }
  // BR-01: cobre _excedido, _token_obrigatorio, _token_invalido e _token_ja_usado —
  // em todos os casos o cliente deve reabrir o modal e obter um token novo.
  if (l.includes('limite_credito')) {
    return MSG_LIMITE_CREDITO[idioma]
  }
  if (l.includes('migration') || (l.includes('function') && l.includes('does not exist'))) {
    return MSG_CAIXA_INDISPONIVEL[idioma]
  }
  if (l.includes('fetch_failed') || l.includes('rpcerr') || l.includes('ok: false')) {
    return MSG_PADRAO[idioma]
  }

  return MSG_PADRAO[idioma]
}

export const CAIXA_MSG = {
  padrao: MSG_PADRAO,
  caixaIndisponivel: MSG_CAIXA_INDISPONIVEL,
  movimentacoesPendentes: MSG_MOVIMENTACOES_PENDENTES,
  caixaFechadoSucesso: 'Caixa fechado com sucesso.',
} as const
