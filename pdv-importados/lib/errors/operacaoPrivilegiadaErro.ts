/**
 * Mensagens para os códigos de erro emitidos por `autorizar_operacao_privilegiada`
 * (SSoT de autorização no banco — cancelamento, devolução e futuras operações
 * privilegiadas). Mantido em um único lugar para não duplicar a mensagem por
 * operação — ver migration 272.
 */
const MSG_SEM_PERMISSAO = 'Sem permissão para esta operação. Peça autorização de um gerente.'
const MSG_TOKEN_INVALIDO = 'Autorização do gerente expirada ou inválida. Peça a senha novamente.'

/** Retorna a mensagem amigável se o código for de autorização privilegiada; senão, null. */
export function mensagemErroOperacaoPrivilegiada(codigoBruto: string): string | null {
  const codigo = codigoBruto.trim().toUpperCase()
  if (codigo.includes('OPERACAO_PRIVILEGIADA_SEM_PERMISSAO')) return MSG_SEM_PERMISSAO
  if (codigo.includes('OPERACAO_PRIVILEGIADA_TOKEN_GERENTE_INVALIDO')) return MSG_TOKEN_INVALIDO
  return null
}
