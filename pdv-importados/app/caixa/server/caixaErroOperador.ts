const MSG_PADRAO = 'Não foi possível concluir. Tente novamente.'
const MSG_CAIXA_INDISPONIVEL = 'Caixa indisponível no momento.'
const MSG_MOVIMENTACOES_PENDENTES = 'Há vendas pendentes para finalizar.'
const MSG_CAIXA_FECHADO = 'Caixa fechado. Abra o caixa antes de finalizar a venda.'
const MSG_SESSAO = 'Sessão expirada. Faça login novamente.'
const MSG_VENDAS_SUSPENSAS = 'Vendas suspensas pelo gerente.'

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
  if (l.includes('finalizar_venda_vendas_suspensas')) {
    return MSG_VENDAS_SUSPENSAS
  }
  if (l.includes('fechar_caixa_movimentacoes_pendentes') || l.includes('movimentação') && l.includes('pendente')) {
    return MSG_MOVIMENTACOES_PENDENTES
  }
  if (l.includes('caixa fechado') || l.includes('não há caixa aberto') || l.includes('nao ha caixa aberto')) {
    return l.includes('finalizar') ? MSG_CAIXA_FECHADO : 'Não há caixa aberto para fechar.'
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
