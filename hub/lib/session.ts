import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { jwtSub, memberRole } from './auth'
import type { Papel } from './crm'
import { DEMO_ME } from './demoData'
import { getConfig, isDemoMode } from './config'
import { demoRepo, restRepo, type Repo } from './repo'

export const ACCESS_COOKIE = 'nc_hub_at'
export const REFRESH_COOKIE = 'nc_hub_rt'

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge,
})

export interface Sessao { repo: Repo; demo: boolean; papel: Papel; me: string }

/** Exige membro ativo da equipe comercial, verificado no servidor; caso contrário, manda para o login. */
export async function requireMember(): Promise<Sessao> {
  if (isDemoMode()) return { repo: demoRepo(), demo: true, papel: 'gestor', me: DEMO_ME }
  const cfg = getConfig()
  if (!cfg) redirect('/login?e=config')
  const token = (await cookies()).get(ACCESS_COOKIE)?.value
  if (!token) redirect('/login')
  // Falha de rede/Supabase na checagem não é "sem acesso": mostra erro próprio em vez de quebrar a página.
  const papel = await memberRole(cfg, token).catch(() => undefined)
  if (papel === undefined) redirect('/login?e=indisponivel')
  if (!papel) redirect('/login?e=forbidden')
  const me = jwtSub(token)
  if (!me) redirect('/login')
  return { repo: restRepo(cfg, token), demo: false, papel, me }
}

/** Exige gestor (acesso total: Central de Conversão, clientes, equipe, auditoria). O banco valida de novo. */
export async function requireGestor(): Promise<Sessao> {
  const s = await requireMember()
  if (s.papel !== 'gestor') redirect('/?aviso=gestor')
  return s
}

/** Compatibilidade: "admin" do hub = gestor. */
export const requireAdmin = requireGestor
