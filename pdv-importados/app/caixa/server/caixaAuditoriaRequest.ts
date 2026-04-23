import { headers } from 'next/headers'

export async function coletarAuditoriaRequest(): Promise<{
  ipAddress: string | null
  userAgent: string | null
}> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  return {
    ipAddress: forwarded || null,
    userAgent: h.get('user-agent') ?? null,
  }
}
