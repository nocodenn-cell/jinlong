export const CONFIG_LOJA_SESSAO_ERROR = 'Não foi possível identificar a loja da sessão.'
export const CONFIG_LOJA_ESCOPO_ERROR = 'Loja informada não pertence à sessão atual.'

type ScopeOptions = {
  requireInput?: boolean
}

function normalizeId(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function validarLojaConfigScope(
  inputLojaId: string | null | undefined,
  sessionLojaId: string | null | undefined,
  options: ScopeOptions = {},
): string | null {
  const sessionId = normalizeId(sessionLojaId)
  if (!sessionId) return CONFIG_LOJA_SESSAO_ERROR

  const inputId = normalizeId(inputLojaId)
  if (!inputId) return options.requireInput ? CONFIG_LOJA_ESCOPO_ERROR : null

  return inputId === sessionId ? null : CONFIG_LOJA_ESCOPO_ERROR
}
