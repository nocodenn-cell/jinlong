'use server'

import { headers } from 'next/headers'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSupabasePublicEnv } from '@/lib/supabase/env'
import { buildAuthCallbackUrl } from '@/lib/auth/appOrigin'
import { ROUTES } from '@/lib/navigation/routes'
import { bootstrapLojaTrial } from '@/lib/cobranca/trialBootstrap'
import {
  TrialSignupSchema, emailDescartavel, hashAntiAbuso, mensagemErroTrial, montarPayloadTrial,
  verificarCaptcha, type TrialSignupInput,
} from '@/lib/cobranca/trialSignup'

export type TrialResult = { ok: true; email: string; trialFim: string } | { ok: false; error: string }

type Rpc = { rpc: (fn: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }

/**
 * Cadastro self-service de teste grátis (público).
 * 1) validação + honeypot + captcha (Turnstile, se configurado) + e-mail descartável;
 * 2) rate limit por IP (hash com sal) no banco;
 * 3) Supabase Auth signUp ⇒ e-mail de verificação (login só depois de confirmar);
 * 4) empresa + loja + DONO + assinatura TRIAL + produtos demo numa transação (plataforma_iniciar_trial);
 * 5) falha em (4) ⇒ usuário do Auth criado agora é apagado (compensação).
 */
export async function iniciarTesteGratisAction(input: TrialSignupInput): Promise<TrialResult> {
  const parsed = TrialSignupSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Confira os campos e aceite os termos. / 请检查表单并同意条款。' }
  const d = parsed.data
  if (d.site) return { ok: true, email: d.email, trialFim: '' } // honeypot: finge sucesso
  if (emailDescartavel(d.email)) return { ok: false, error: 'Use um e-mail permanente. / 请使用常用邮箱。' }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'desconhecido'
  if (!(await verificarCaptcha(d.captchaToken, ip))) return { ok: false, error: 'Verificação anti-robô falhou. / 人机验证失败。' }

  const sal = process.env.TRIAL_HASH_SALT?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) || 'fp'
  const admin = createAdminClient()
  const rpc = admin as unknown as Rpc
  const { data: permitido, error: rlErr } = await rpc.rpc('trial_registrar_tentativa', {
    p_ip_hash: hashAntiAbuso(ip, sal), p_email_hash: hashAntiAbuso(d.email, sal), // limite por IP vem de saas.parametros
  })
  if (rlErr) return { ok: false, error: mensagemErroTrial(rlErr.message) }
  if (permitido !== true) return { ok: false, error: mensagemErroTrial('TRIAL_LIMITE_IP') }

  const { url, key } = assertSupabasePublicEnv()
  const anon = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: su, error: suErr } = await anon.auth.signUp({
    email: d.email,
    password: d.senha,
    options: {
      emailRedirectTo: buildAuthCallbackUrl(ROUTES.admin.assinatura),
      data: { full_name: d.donoNome, origem: 'trial' },
    },
  })
  // e-mail já existente: Supabase devolve user sem identities (não vaza se existe)
  if (suErr || !su.user || (su.user.identities?.length ?? 0) === 0) {
    return { ok: false, error: mensagemErroTrial(suErr?.message ?? 'already registered') }
  }
  const userId = su.user.id

  try {
    const { data, error } = await rpc.rpc('plataforma_iniciar_trial', { p: montarPayloadTrial(d, userId) }) // duração: saas.parametros.trial_dias
    if (error) throw new Error(error.message)
    const r = data as { empresa_id?: string; loja_id: string; trial_fim: string }
    await bootstrapLojaTrial(admin, r.loja_id, userId, d.idioma).catch((e) => {
      console.error('[trial] bootstrap da loja incompleto', e instanceof Error ? e.message : e)
    })
    // ficha na Central de Conversão do hub (com o telefone informado); falha não bloqueia o teste
    if (r.empresa_id) {
      await rpc.rpc('commercial_trial_garantir_lead', { p_empresa: r.empresa_id, p_telefone: d.telefone || null })
        .then(({ error }) => { if (error) throw new Error(error.message) })
        .catch((e) => console.error('[trial] ficha comercial não criada', e instanceof Error ? e.message : e))
    }
    return { ok: true, email: d.email, trialFim: r.trial_fim }
  } catch (e) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined)
    return { ok: false, error: mensagemErroTrial(e instanceof Error ? e.message : '') }
  }
}
