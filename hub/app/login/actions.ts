'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAdmin, signIn } from '@/lib/auth'
import { getConfig } from '@/lib/config'
import { ACCESS_COOKIE, cookieOptions, REFRESH_COOKIE } from '@/lib/session'

export async function login(form: FormData) {
  const cfg = getConfig()
  if (!cfg) redirect('/login?e=config')
  const email = String(form.get('email') ?? '').trim().slice(0, 200)
  const password = String(form.get('password') ?? '').slice(0, 200)
  if (!email || !password) redirect('/login?e=invalid')
  const tokens = await signIn(cfg, email, password).catch(() => null)
  if (!tokens) redirect('/login?e=invalid')
  // Sem papel admin no banco, nem guarda a sessão.
  if (!(await isAdmin(cfg, tokens.access_token).catch(() => false))) redirect('/login?e=forbidden')
  const jar = await cookies()
  jar.set(ACCESS_COOKIE, tokens.access_token, cookieOptions(3600))
  jar.set(REFRESH_COOKIE, tokens.refresh_token, cookieOptions(60 * 60 * 24 * 7))
  redirect('/')
}
