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
  // O bloqueio é `FECHAR_CAIXA_MOVIMENTACOES_PENDENTES` — flux de caixa, não
  // venda. O texto anterior ('有待完成的销售。') dizia "há vendas pendentes" e
  // ainda omitia a instrução que a versão pt traz, mandando o operador chinês
  // procurar uma venda que não existe. `资金流水` é o termo já usado no resto
  // do zh.json para movimentação de caixa (ver `sec_movimentos_caixa`).
  zh: '有待处理的收银台资金流水。请先处理这些流水，再结算收银台。',
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
/**
 * `CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE` (migration 2026-09-09): o caixa
 * aberto não tem, em dinheiro, o valor a estornar — tipicamente porque uma
 * sangria já levou o valor para o cofre. A mensagem precisa dizer a saída
 * operacional (suprimento), senão o operador só vê "tente novamente" e repete
 * uma ação que nunca vai passar. Espelha a mensagem irmã da devolução
 * (`DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE`).
 */
const MSG_CANCELAR_SALDO_CAIXA: Record<IdiomaErro, string> = {
  pt: 'Dinheiro em caixa insuficiente para estornar esta venda. Registre um suprimento com o valor e cancele novamente.',
  zh: '收银台现金不足以退还本笔销售。请先登记等额的现金补充，再重新取消。',
}
/**
 * `VENDAS_SUSPENSAS` (trigger de `vendas`, migration 20260930090100): regra do banco,
 * vale para todos os perfis. Não é falha transitória — repetir não adianta.
 */
const MSG_VENDAS_SUSPENSAS: Record<IdiomaErro, string> = {
  pt: 'Vendas suspensas pela gerência. Nenhuma venda pode ser finalizada até serem reativadas.',
  zh: '门店已暂停销售。恢复前无法完成任何销售。',
}
const MSG_VENDAS_EM_ESPERA_FECHAMENTO: Record<IdiomaErro, string> = {
  pt: 'Há vendas em espera neste caixa. Conclua ou descarte as vendas em espera antes de fechar o caixa.',
  zh: '本台收银机有挂起的销售。关闭前请完成或放弃这些挂起的销售。',
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
  if (l.includes('fechar_caixa_vendas_em_espera')) {
    return MSG_VENDAS_EM_ESPERA_FECHAMENTO[idioma]
  }
  if (l.includes('vendas_suspensas')) {
    return MSG_VENDAS_SUSPENSAS[idioma]
  }
  if (l.includes('caixa fechado') || l.includes('não há caixa aberto') || l.includes('nao ha caixa aberto')) {
    return l.includes('finalizar') ? MSG_CAIXA_FECHADO[idioma] : MSG_NAO_HA_CAIXA_ABERTO[idioma]
  }
  // Antes do teste genérico de estoque: a string contém "insuficiente", mas o
  // que falta é dinheiro na gaveta, não produto.
  if (l.includes('cancelar_venda_saldo_caixa_insuficiente')) {
    return MSG_CANCELAR_SALDO_CAIXA[idioma]
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
