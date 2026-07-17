import { mensagemErroOperacaoPrivilegiada } from '@/lib/errors/operacaoPrivilegiadaErro'

const MSG_PADRAO = 'Não foi possível concluir. Tente novamente.'
const MSG_CAIXA_INDISPONIVEL = 'Caixa indisponível no momento.'
const MSG_MOVIMENTACOES_PENDENTES = 'Há vendas pendentes para finalizar.'
const MSG_CAIXA_FECHADO = 'Caixa fechado. Abra o caixa antes de finalizar a venda.'
const MSG_SESSAO = 'Sessão expirada. Faça login novamente.'
const MSG_ESTOQUE = 'Estoque insuficiente para um ou mais itens. Ajuste o carrinho e tente novamente.'
const MSG_PRECO = 'Os preços do carrinho mudaram. Atualize as quantidades e finalize novamente.'
const MSG_PAGAMENTO = 'Pagamento inválido ou divergente do total. Revise as formas de pagamento.'
const MSG_CLIENTE_SALDO = 'Pagamento parcial exige um cliente válido da loja.'

function lower(raw: string): string {
  return raw.toLowerCase()
}

/** Boundary operador: nunca expõe rpcErr, SQL, migrations ou códigos internos. */
export function caixaErroOperador(detalheTecnico: string | undefined | null): string {
  const raw = (detalheTecnico ?? '').trim()
  if (!raw) return MSG_PADRAO

  const l = lower(raw)

  const msgOperacaoPrivilegiada = mensagemErroOperacaoPrivilegiada(raw)
  if (msgOperacaoPrivilegiada) return msgOperacaoPrivilegiada

  if (l.includes('sessão expirada') || l.includes('sessao expirada') || l.includes('jwt')) {
    return MSG_SESSAO
  }
  if (l.includes('fechar_caixa_movimentacoes_pendentes') || (l.includes('movimentação') && l.includes('pendente'))) {
    return MSG_MOVIMENTACOES_PENDENTES
  }
  if (l.includes('caixa fechado') || l.includes('não há caixa aberto') || l.includes('nao ha caixa aberto')) {
    return l.includes('finalizar') ? MSG_CAIXA_FECHADO : 'Não há caixa aberto para fechar.'
  }
  if (l.includes('finalizar_venda_canonica_estoque') || l.includes('estoque insuficiente')) {
    return MSG_ESTOQUE
  }
  if (
    l.includes('preco_divergente') ||
    l.includes('tipo_preco_divergente') ||
    l.includes('preco_nao_validado') ||
    l.includes('totais_divergentes')
  ) {
    return MSG_PRECO
  }
  if (
    l.includes('pagamentos_divergentes') ||
    l.includes('pagamentos_excedem_total') ||
    l.includes('pagamento_zero') ||
    l.includes('forma_pagamento_invalida') ||
    l.includes('valor_pagamento_invalido')
  ) {
    return MSG_PAGAMENTO
  }
  if (
    l.includes('saldo_pendente_exige_cliente') ||
    l.includes('cliente_loja_invalido')
  ) {
    return MSG_CLIENTE_SALDO
  }
  if (l.includes('migration') || (l.includes('function') && l.includes('does not exist'))) {
    return MSG_CAIXA_INDISPONIVEL
  }
  if (l.includes('fetch_failed') || l.includes('rpcerr') || l.includes('ok: false')) {
    return MSG_PADRAO
  }

  return MSG_PADRAO
}

export const CAIXA_MSG = {
  padrao: MSG_PADRAO,
  caixaIndisponivel: MSG_CAIXA_INDISPONIVEL,
  movimentacoesPendentes: MSG_MOVIMENTACOES_PENDENTES,
  caixaFechadoSucesso: 'Caixa fechado com sucesso.',
} as const
