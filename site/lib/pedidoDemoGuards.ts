/**
 * Guardas do POST /pedido-demo que rodam no servidor do site, antes de chamar a persistência.
 * Desenho completo: docs/planos/LEADS_ENDPOINT_PROTEGIDO.md. Estas funções não substituem a validação do banco
 * (registrar_lead_comercial); são a primeira barreira e a fonte do IP que o banco usa no limite de taxa.
 */

const IP_SHAPE = /^[0-9a-fA-F:.]{2,45}$/

type HeaderSource = { get(name: string): string | null }

/**
 * IP do visitante. Ordem de confiança:
 *  1. x-vercel-forwarded-for: a plataforma o define e sobrescreve; o cliente não controla.
 *  2. x-real-ip.
 *  3. último item de x-forwarded-for: é o que o proxy de borda acrescenta; itens anteriores vêm do cliente.
 * Sem IP válido, devolve 'sem-ip' (o banco aplica o mesmo limite e falha fechado).
 *
 * Motivo do cuidado: o site chama o banco a partir do servidor. Se o banco lesse o IP dos cabeçalhos da chamada
 * do servidor, todos os visitantes contariam como um só IP (o do servidor) e o limite travaria o site inteiro.
 */
export function clientIpFrom(headers: HeaderSource): string {
  const vercel = headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  if (vercel && IP_SHAPE.test(vercel)) return vercel
  const real = headers.get('x-real-ip')?.trim()
  if (real && IP_SHAPE.test(real)) return real
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const ultimo = xff.split(',').pop()?.trim() ?? ''
    if (IP_SHAPE.test(ultimo)) return ultimo
  }
  return 'sem-ip'
}

/**
 * Content-Type exatamente application/json (essência do media type, sem parâmetros, sem diferenciar caixa).
 * text/plain;foo=application/json NÃO passa: text/plain é CORS-safelisted, então um site de terceiros conseguiria
 * enviar corpo JSON sem preflight se o servidor aceitasse uma substring.
 */
export function ehJson(contentType: string | null): boolean {
  const essencia = (contentType ?? '').split(';')[0] ?? ''
  return essencia.trim().toLowerCase() === 'application/json'
}

/** Origens aceitas para o POST: a origem pública do site e, opcionalmente, origens extras (previews), separadas por vírgula. */
export function origensPermitidas(siteUrl: string, extras?: string): string[] {
  const set = new Set<string>()
  const add = (v: string) => {
    try {
      set.add(new URL(v.trim()).origin)
    } catch {
      /* valor inválido na configuração: ignorado */
    }
  }
  add(siteUrl)
  for (const e of (extras ?? '').split(',')) if (e.trim()) add(e)
  return [...set]
}

/** Verificação de origem (CSRF básico): exige cabeçalho Origin exato. Sem Origin, recusa (navegadores enviam em POST). */
export function origemPermitida(origin: string | null, permitidas: readonly string[]): boolean {
  if (!origin) return false
  try {
    return permitidas.includes(new URL(origin).origin)
  } catch {
    return false
  }
}

export type EventoLog = 'recebido' | 'rejeitado' | 'honeypot' | 'gravado' | 'limite' | 'indisponivel'

/**
 * Linha de log de uma tentativa, sem dado pessoal: sem nome, loja, contato, IP ou protocolo.
 * Campos permitidos: evento, status HTTP, motivo técnico curto (código, nunca valor enviado) e a hora truncada.
 */
export function linhaDeLog(evento: EventoLog, status: number, motivo?: string, agora: Date = new Date()): string {
  const hora = agora.toISOString().slice(0, 13) + ':00Z'
  const linha: Record<string, string | number> = { evt: 'pedido-demo', etapa: evento, status, hora }
  if (motivo && /^[A-Z_]{2,40}$/.test(motivo)) linha.motivo = motivo
  return JSON.stringify(linha)
}
