import { NextResponse } from 'next/server'
import { resolveAdminSession } from './resolveAdminSession'
import type { AdminSession } from './types'

export async function requireAdminSessionApi(): Promise<AdminSession | NextResponse> {
  const session = await resolveAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return session
}
