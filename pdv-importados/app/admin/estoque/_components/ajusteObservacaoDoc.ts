/**
 * Referência/documento no ajuste manual — dívida técnica:
 * o modelo não tem coluna dedicada; embute em `observacao` como `[Doc: …]`.
 * Centralizado para evitar duplicar o prefixo e preservar o texto do operador.
 */

const DOC_PREFIX = '[Doc:'

/** Extrai referência e observação limpa se a obs já veio com `[Doc: …]`. */
export function separarDocObservacao(raw: string): { referencia: string; observacao: string } {
  const trimmed = raw.trim()
  if (!trimmed.startsWith(DOC_PREFIX)) {
    return { referencia: '', observacao: trimmed }
  }
  const close = trimmed.indexOf(']')
  if (close < 0) return { referencia: '', observacao: trimmed }
  const referencia = trimmed.slice(DOC_PREFIX.length, close).trim()
  const observacao = trimmed.slice(close + 1).trim()
  return { referencia, observacao }
}

/** Monta observação final sem duplicar `[Doc: …]`. */
export function montarObservacaoComDoc(referencia: string, observacao: string): string | undefined {
  const { referencia: refExistente, observacao: obsLimpa } = separarDocObservacao(observacao)
  const ref = (referencia.trim() || refExistente).trim()
  const obs = obsLimpa.trim()
  if (ref && obs) return `[Doc: ${ref}] ${obs}`
  if (ref) return `[Doc: ${ref}]`
  return obs || undefined
}
