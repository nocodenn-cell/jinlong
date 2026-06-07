import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? 'local'
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'
  const timestamp = Date.now()

  return NextResponse.json({ deploymentId, gitSha, timestamp })
}
