/**
 * Sanitizador central de telemetria.
 *
 * POR QUE EXISTE: os três `beforeSend` do Sentry (client/server/edge) apenas
 * FILTRAVAM eventos — nada era redigido. Payloads de server action, breadcrumbs
 * e contexts de venda chegavam íntegros ao Sentry, incluindo dados pessoais de
 * cliente (CPF/CNPJ, e-mail, telefone) e credenciais (authorization, cookie,
 * token). Este módulo é o único ponto de redação, aplicado nas bordas.
 *
 * Estratégia: duas camadas.
 *   1. CHAVE sensível  → valor inteiro vira [REDIGIDO], sem olhar o conteúdo.
 *   2. TEXTO           → padrões de PII/credencial são substituídos no lugar.
 *
 * A camada 1 é fail-closed por nome; a camada 2 pega o que vaza dentro de
 * mensagens livres ("falha ao cobrar joao@x.com"). Sobra-se para o lado de
 * redigir demais: uma mensagem parcialmente mascarada ainda serve para debug,
 * um CPF vazado não tem volta.
 *
 * É `.js` (e não `.ts`) porque `sentry.server.config.js` e
 * `sentry.edge.config.js` são JS — mesmo motivo de `sentryEnvironment.js`.
 */

export const REDIGIDO = '[REDIGIDO]'

/**
 * Chaves cujo VALOR é sempre descartado, em qualquer profundidade.
 * `authorization` é explícito de propósito: `auth` sozinho casaria `autoria`,
 * `author` e `authenticated`, que não são segredos.
 */
const CHAVE_SENSIVEL =
  /(senha|password|passwd|token|secret|authorization|cookie|session[_-]?id|api[_-]?key|apikey|jwt|bearer|credential|cpf|cnpj|documento|email|e[_-]?mail|telefone|celular|phone)/i

/** Ordem importa: CNPJ antes de CPF, e telefone por último. */
const PADROES = [
  // CNPJ formatado ou 14 dígitos corridos.
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g,
  // CPF formatado ou 11 dígitos corridos.
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g,
  // E-mail.
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  // JWT (três segmentos base64url) — cobre anon key, service key e access token.
  /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g,
  // Header Authorization inline.
  /\bBearer\s+[\w.-]+/gi,
  // Telefone BR. Exige separador entre os dois grupos finais para não casar
  // corridas de dígitos de UUID/trace_id.
  /(?:\+55[\s-]?)?(?:\(\d{2}\)|\b\d{2})[\s-]?9?\d{4}[\s-]\d{4}\b/g,
]

/** Redige PII e credenciais dentro de uma string livre. */
export function redigirTexto(texto) {
  if (typeof texto !== 'string' || texto.length === 0) return texto
  let saida = texto
  for (const p of PADROES) saida = saida.replace(p, REDIGIDO)
  return saida
}

/**
 * Profundidade máxima. Eventos do Sentry aninham bastante (exception → values →
 * stacktrace → frames → vars), então o limite é folgado; existe só para não
 * percorrer estruturas patológicas.
 */
const PROFUNDIDADE_MAX = 12

function caminhar(valor, vistos, nivel) {
  if (valor == null) return valor
  const t = typeof valor
  if (t === 'string') return redigirTexto(valor)
  if (t === 'number' || t === 'boolean' || t === 'bigint') return valor
  if (t === 'function' || t === 'symbol') return undefined
  if (nivel > PROFUNDIDADE_MAX) return '[PROFUNDO]'

  // Referência circular: o Sentry serializa o evento depois; devolver o mesmo
  // objeto recriaria o ciclo, então corta-se aqui.
  if (vistos.has(valor)) return '[CIRCULAR]'
  vistos.set(valor, true)

  if (valor instanceof Date) return valor
  if (valor instanceof Error) {
    // Error não é enumerável: vira objeto simples com os campos que importam.
    return {
      name: valor.name,
      message: redigirTexto(valor.message),
      stack: redigirTexto(valor.stack ?? ''),
    }
  }
  if (Array.isArray(valor)) return valor.map((v) => caminhar(v, vistos, nivel + 1))

  const saida = {}
  for (const [k, v] of Object.entries(valor)) {
    saida[k] = CHAVE_SENSIVEL.test(k) ? REDIGIDO : caminhar(v, vistos, nivel + 1)
  }
  return saida
}

/**
 * Devolve uma CÓPIA redigida. O objeto original nunca é modificado — o payload
 * segue íntegro para o resto do fluxo da aplicação; só a via de telemetria vê a
 * versão redigida.
 */
export function redigir(valor) {
  return caminhar(valor, new WeakMap(), 0)
}
