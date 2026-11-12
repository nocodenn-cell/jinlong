import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAdmin } from './auth'
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

/** Exige admin verificado no servidor; caso contrário, manda para o login. */
export async function requireAdmin(): Promise<{ repo: Repo; demo: boolean }> {
  if (isDemoMode()) return { repo: demoRepo(), demo: true }
  const cfg = getConfig()
  if (!cfg) redirect('/login?e=config')
  const token = (await cookies()).get(ACCESS_COOKIE)?.value
  if (!token) redirect('/login')
  // Falha de rede/Supabase na checagem não é "sem acesso": mostra erro próprio em vez de quebrar a página.
  const admin = await isAdmin(cfg, token).catch(() => null)
  if (admin === null) redirect('/login?e=indisponivel')
  if (!admin) redirect('/login?e=forbidden')
  return { repo: restRepo(cfg, token), demo: false }
}
