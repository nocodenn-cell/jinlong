const MSG_PADRAO = 'Não foi possível concluir. Tente novamente.'
const MSG_CAIXA_INDISPONIVEL = 'Caixa indisponível no momento.'
const MSG_MOVIMENTACOES_PENDENTES = 'Há vendas pendentes para finalizar.'
const MSG_CAIXA_FECHADO = 'Caixa fechado. Abra o caixa antes de finalizar a venda.'
const MSG_SESSAO = 'Sessão expirada. Faça login novamente.'
const MSG_ITEM_NAO_VENDAVEL = 'Há itens inválidos/inativos no carrinho. Atualize e tente novamente.'
const MSG_PRECO_MUDOU = 'Os preços do carrinho mudaram. Recalcule o cupom e finalize novamente.'
const MSG_TOTAL_INVALIDO = 'Total da venda inválido. Revise os itens e tente novamente.'

function lower(raw: string): string {
  return raw.toLowerCase()
}

/** Boundary operador: nunca expõe rpcErr, SQL, migrations ou códigos internos. */
export function caixaErroOperador(detalheTecnico: string | undefined | null): string {
  const raw = (detalheTecnico ?? '').trim()
  if (!raw) return MSG_PADRAO

  const l = lower(raw)

  if (l.includes('sessão expirada') || l.includes('sessao expirada') || l.includes('jwt')) {
    return MSG_SESSAO
  }
  if (l.includes('fechar_caixa_movimentacoes_pendentes') || l.includes('movimentação') && l.includes('pendente')) {
    return MSG_MOVIMENTACOES_PENDENTES
  }
  if (l.includes('caixa fechado') || l.includes('não há caixa aberto') || l.includes('nao ha caixa aberto')) {
    return l.includes('finalizar') ? MSG_CAIXA_FECHADO : 'Não há caixa aberto para fechar.'
  }
  // Códigos da RPC v3 (migrations 235/236): autoridade de preço/vendabilidade no SQL.
  // Mapeamento de UX apenas — nunca expõe o código técnico ao operador.
  if (l.includes('produto_nao_vendavel') || l.includes('produto_nao_encontrado')) {
    return MSG_ITEM_NAO_VENDAVEL
  }
  if (l.includes('total_liquido_invalido')) {
    return MSG_TOTAL_INVALIDO
  }
  if (
    l.includes('preco_divergente') ||
    l.includes('preco_original_divergente') ||
    l.includes('preco_acima_referencia') ||
    l.includes('preco_nao_validado') ||
    l.includes('tipo_preco_divergente')
  ) {
    return MSG_PRECO_MUDOU
  }
  if (l.includes('migration') || l.includes('function') && l.includes('does not exist')) {
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
