/**
 * Mensagens em português para erros exibidos no PDV desktop (Tauri).
 * Versão alinhada à ideia de `pdv-importados/lib/errors/mensagemErroUsuario.ts`.
 */

const MSG_PADRAO =
  'Não foi possível concluir esta operação agora. Tente de novo em alguns instantes.'

function truncar(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export function mensagemErroParaUsuario(detalheTecnico: string): string {
  const raw = (detalheTecnico ?? '').trim()
  if (!raw) return MSG_PADRAO

  const lower = raw.toLowerCase()

  if (lower.includes('falta sync_endpoint') || lower.includes('sync_endpoint')) {
    return 'Falta configurar SYNC_ENDPOINT no arquivo .env do PDV (URL da função de sincronização). Peça ao suporte técnico.'
  }
  if (lower.includes('sync_key') || lower.includes('falta sync_key')) {
    return 'Falta configurar SYNC_KEY no .env do PDV (mesmo segredo da nuvem). Peça ao suporte técnico.'
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('connection') ||
    lower.includes('econnrefused') ||
    lower.includes('dns') ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return 'Problema de rede: não foi possível contatar o servidor. Verifique a internet e tente de novo.'
  }

  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized')) {
    return 'O servidor recusou a sincronização (acesso não autorizado). Verifique SYNC_KEY e configuração.'
  }

  const parecePt =
    /(ção|ões|não|caixa|venda|senha|gerente|catálogo|sincroniz|falha|erro|inválido|abra|fech)/i.test(
      raw,
    ) && !/^(error|failed|invalid)\b/i.test(raw)

  if (parecePt) return raw

  return `${MSG_PADRAO} Informação para suporte: «${truncar(raw, 200)}».`
}

export function mensagemErroComContexto(contexto: string, detalhe: string): string {
  const c = contexto.trim()
  const m = mensagemErroParaUsuario(detalhe)
  return c ? `${c}: ${m}` : m
}

export function mensagemErroDeExcecao(e: unknown, fallbackPt: string): string {
  if (e instanceof Error && e.message.trim()) {
    return mensagemErroParaUsuario(e.message)
  }
  return fallbackPt
}
