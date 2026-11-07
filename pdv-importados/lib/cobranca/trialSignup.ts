import { createHash } from 'node:crypto'
import { z } from 'zod'

export const TRIAL_DIAS = 15

export const TrialSignupSchema = z.object({
  empresaNome: z.string().trim().min(2).max(120),
  lojaNome: z.string().trim().min(2).max(120).optional(),
  donoNome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  senha: z.string().min(8).max(128),
  telefone: z.string().trim().max(30).optional(),
  plano: z.enum(['BASICO', 'ATACADO', 'REDE']).default('ATACADO'),
  idioma: z.enum(['pt', 'zh']).default('pt'),
  aceiteTermos: z.literal(true),
  /** honeypot: campo escondido; robô preenche ⇒ recusa silenciosa */
  site: z.string().max(0).optional().or(z.literal('')),
  captchaToken: z.string().max(4096).optional(),
})
export type TrialSignupInput = z.input<typeof TrialSignupSchema>

/** Hash com sal do servidor: não guardamos IP/e-mail em claro na tabela de rate limit. */
export function hashAntiAbuso(valor: string, sal: string): string {
  return createHash('sha256').update(`${sal}:${valor.trim().toLowerCase()}`).digest('hex')
}

/** Domínios de e-mail descartável mais comuns (lista curta; ampliar conforme abuso real). */
const DESCARTAVEIS = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com'])
export function emailDescartavel(email: string): boolean {
  return DESCARTAVEIS.has(email.split('@')[1]?.toLowerCase() ?? '')
}

/** Turnstile só fica ativo com chave do site E chave secreta (evita travar o cadastro com só uma delas). */
export function captchaAtivo(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() && env.TRIAL_CAPTCHA_SECRET?.trim())
}

/**
 * CAPTCHA Cloudflare Turnstile (verificação no servidor, siteverify).
 * Sem as duas chaves ⇒ desligado (dev/homolog) — em produção configurar antes de divulgar.
 */
export async function verificarCaptcha(
  token: string | undefined,
  ip: string | null,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!captchaAtivo(env)) return true
  const secret = env.TRIAL_CAPTCHA_SECRET!.trim()
  if (!token) return false
  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.set('remoteip', ip)
  try {
    const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
    const j = (await r.json()) as { success?: boolean }
    return j.success === true
  } catch {
    return false
  }
}

export function montarPayloadTrial(d: z.output<typeof TrialSignupSchema>, donoId: string) {
  const loja = d.lojaNome?.trim() || d.empresaNome.trim()
  return {
    plano: d.plano,
    demo: true,
    empresa: { nome: d.empresaNome.trim() },
    lojas: [{ chave: 'loja1', nome: loja, codigo: null }],
    usuarios: [{ id: donoId, nome: d.donoNome.trim(), papel: 'DONO', idioma: d.idioma }],
  }
}

export function mensagemErroTrial(raw: string): string {
  if (/TRIAL_LIMITE/.test(raw)) return 'Muitos cadastros a partir desta rede. Tente amanhã ou fale com a gente. / 该网络注册次数过多，请明天再试。'
  if (/PROVISIONAR_USUARIO_DE_OUTRA_EMPRESA|TRIAL_USUARIO_JA_EXISTE|already|registered/i.test(raw)) return 'Este e-mail já tem cadastro. Faça login. / 该邮箱已注册，请登录。'
  return 'Não foi possível criar o teste agora. Tente de novo. / 暂时无法创建试用，请重试。'
}

/**
 * Sal do hash anti-abuso do trial. Nunca deriva de credencial (ex.: service role key).
 * Produção sem TRIAL_HASH_SALT (>= 16 caracteres) ⇒ null (o chamador recusa: fail closed).
 */
export function saltAntiAbuso(env: Record<string, string | undefined> = process.env): string | null {
  const sal = env.TRIAL_HASH_SALT?.trim()
  if (sal && sal.length >= 16) return sal
  const producao = env.VERCEL_ENV === 'production' || (env.NODE_ENV === 'production' && !env.VERCEL_ENV)
  return producao ? null : 'fp-dev-trial-salt-nao-usar-em-producao'
}
