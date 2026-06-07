import { NextResponse } from 'next/server'

import { getAdminContext, type AdminContext, type AdminContextRequest } from '@/lib/admin/context/adminContext'
import { apiAdminDecision } from '@/lib/admin/policy/adminPolicy'
import { getCachedAdminSession } from './sessionConsistency'
import type { AdminSession } from './types'

export async function requireAdminSessionApi(
  resource?: string
): Promise<AdminSession | NextResponse> {
  const session = await getCachedAdminSession()
  const decision = apiAdminDecision(session, resource)

  if (decision.type !== 'allow') {
    return NextResponse.json({ error: 'unauthorized', reason: decision.reason }, { status: 401 })
  }

  return session as AdminSession
}

export async function requireAdminContextApi(
  request: AdminContextRequest = {}
): Promise<AdminContext | NextResponse> {
  const session = await getCachedAdminSession()
  const decision = apiAdminDecision(session, request.resource)

  if (decision.type !== 'allow') {
    return NextResponse.json({ error: 'unauthorized', reason: decision.reason }, { status: 401 })
  }

  return getAdminContext(session as AdminSession, request)
}
