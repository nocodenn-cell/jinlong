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

/**
 * Códigos do banco que não são falha transitória: "tente novamente" faria o operador repetir
 * uma ação que nunca vai passar. Cada mensagem diz o motivo e a saída operacional
 * (sprint UX 2026-11-27; antes todos caíam no MSG_PADRAO).
 */
const MSG_PAGAMENTO_SEM_CONTA: Record<IdiomaErro, string> = {
  // Trigger `PAGAMENTO_SEM_CONTA_FINANCEIRA` (migration 20261107110000): a forma escolhida não tem
  // conta financeira na loja. Só o gerente/dono resolve, em Dinheiro › Contas e saldos.
  pt: 'Esta forma de pagamento ainda não tem conta financeira na loja. Use outra forma ou peça ao gerente para configurar em Dinheiro › Contas e saldos.',
  zh: '该付款方式在门店尚未设置财务账户。请改用其他付款方式，或请经理在“资金 › 账户与余额”中设置。',
}
const MSG_CANCELAR_SEM_CAIXA_ABERTO: Record<IdiomaErro, string> = {
  pt: 'Para estornar em dinheiro uma venda de caixa já fechado, é preciso ter um caixa aberto na loja. Abra o caixa e cancele novamente.',
  zh: '退还已结算收银台的现金销售时，门店必须有一个已开启的收银台。请先开启收银台，再重新取消。',
}
const MSG_CANCELAR_CAIXA_AMBIGUO: Record<IdiomaErro, string> = {
  pt: 'Há mais de um caixa aberto na loja e o estorno em dinheiro precisa sair de um só. Feche os caixas extras e cancele novamente.',
  zh: '门店有多个已开启的收银台，现金退款只能从一个收银台支出。请先结算多余的收银台，再重新取消。',
}
const MSG_VENDA_JA_CANCELADA: Record<IdiomaErro, string> = {
  pt: 'Esta venda já foi cancelada. Atualize a tela para ver a situação atual.',
  zh: '该笔销售已被取消。请刷新页面查看最新状态。',
}
const MSG_VENDA_NAO_ENCONTRADA: Record<IdiomaErro, string> = {
  pt: 'Venda não encontrada nesta loja. Atualize a tela e confira o número da venda.',
  zh: '在本门店找不到该笔销售。请刷新页面并核对销售编号。',
}
const MSG_SEM_PERMISSAO: Record<IdiomaErro, string> = {
  pt: 'Seu perfil não tem permissão para esta operação. Chame o gerente.',
  zh: '您的角色无权执行此操作。请联系经理。',
}
const MSG_MOTIVO_OBRIGATORIO: Record<IdiomaErro, string> = {
  pt: 'Informe o motivo (pelo menos 3 letras) para continuar.',
  zh: '请填写原因（至少 3 个字符）后继续。',
}
const MSG_FECHAR_EM_USO: Record<IdiomaErro, string> = {
  pt: 'Este caixa está com outro operador. Só ele, o gerente ou o dono podem fechá-lo.',
  zh: '该收银台正由其他操作员使用。只有该操作员、经理或店主可以结算。',
}
const MSG_FECHAR_VALOR_DIVERGENTE: Record<IdiomaErro, string> = {
  pt: 'Este caixa já foi fechado com outro valor contado. Confira o comprovante do fechamento no histórico.',
  zh: '该收银台已按另一个清点金额结算。请在历史记录中查看结算凭证。',
}

function lower(raw: string): string {
  return raw.toLowerCase()
}

/**
 * Fallback genérico ("Não foi possível concluir"): o operador não recebe o motivo, então o detalhe bruto vai
 * para o log do servidor. Só registra quando não há `document` (o mapeador também é importado por componentes
 * cliente, que não devem logar). Sem efeito na mensagem exibida.
 */
function padraoRegistrado(motivo: 'vazio' | 'nao_mapeado', raw: string, idioma: IdiomaErro): string {
  if (typeof document === 'undefined') {
    console.error(
      JSON.stringify({
        evento: 'caixa.erro_operador.fallback',
        motivo,
        idioma,
        detalhe: raw.slice(0, 500),
        em: new Date().toISOString(),
      }),
    )
  }
  return MSG_PADRAO[idioma]
}

/** Boundary operador: nunca expõe rpcErr, SQL, migrations ou códigos internos. */
export function caixaErroOperador(
  detalheTecnico: string | undefined | null,
  idiomaInput?: string,
): string {
  const idioma = idiomaSeguro(idiomaInput)
  const raw = (detalheTecnico ?? '').trim()
  if (!raw) return padraoRegistrado('vazio', '', idioma)

  const l = lower(raw)

  if (
    l.includes('sessão expirada') ||
    l.includes('sessao expirada') ||
    l.includes('jwt') ||
    l.includes('fechar_caixa_sessao_expirada') ||
    l.includes('cancelar_venda_auth')
  ) {
    return MSG_SESSAO[idioma]
  }
  // Códigos específicos ANTES dos testes genéricos por substring ("caixa fechado", "pagamento"…).
  if (l.includes('pagamento_sem_conta_financeira')) return MSG_PAGAMENTO_SEM_CONTA[idioma]
  if (l.includes('cancelar_venda_caixa_fechado_sem_caixa_aberto')) return MSG_CANCELAR_SEM_CAIXA_ABERTO[idioma]
  if (l.includes('cancelar_venda_caixa_aberto_ambiguo')) return MSG_CANCELAR_CAIXA_AMBIGUO[idioma]
  if (l.includes('cancelar_venda_ja_cancelada')) return MSG_VENDA_JA_CANCELADA[idioma]
  if (l.includes('cancelar_venda_nao_encontrada')) return MSG_VENDA_NAO_ENCONTRADA[idioma]
  if (l.includes('fechar_caixa_em_uso_outro_operador')) return MSG_FECHAR_EM_USO[idioma]
  if (l.includes('fechar_caixa_repeticao_valor_divergente')) return MSG_FECHAR_VALOR_DIVERGENTE[idioma]
  if (l.includes('_sem_permissao')) return MSG_SEM_PERMISSAO[idioma]
  if (l.includes('motivo_obrigatorio')) return MSG_MOTIVO_OBRIGATORIO[idioma]
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
    return padraoRegistrado('nao_mapeado', raw, idioma)
  }

  return padraoRegistrado('nao_mapeado', raw, idioma)
}

export const CAIXA_MSG = {
  padrao: MSG_PADRAO,
  caixaIndisponivel: MSG_CAIXA_INDISPONIVEL,
  movimentacoesPendentes: MSG_MOVIMENTACOES_PENDENTES,
  caixaFechadoSucesso: 'Caixa fechado com sucesso.',
} as const
