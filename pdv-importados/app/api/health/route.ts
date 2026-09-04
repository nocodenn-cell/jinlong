import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const SUPABASE_CHECK_TIMEOUT_MS = 2000

/**
 * Item 17 do Plano Mestre: antes disso o endpoint sempre respondia 200 sem
 * checar nenhuma dependência real — um Supabase fora do ar não derrubava
 * este health check. `select` mínimo (head+count, sem trazer linha) com
 * timeout curto; falha/timeout vira `degraded` no corpo, nunca uma exceção
 * não tratada.
 *
 * HTTP status continua sempre 200 (não 503): `scripts/validate-production.mjs`
 * (gate SSRA, `.github/workflows/release-validate.yml`) trata `!res.ok` como
 * falha de release e só lê `deploymentId` do corpo — um blip do Supabase não
 * pode derrubar esse gate, que audita autoridade de deploy, não saúde de
 * dependência. `checks.supabase` no corpo é o sinal real para quem quiser
 * monitorar a dependência.
 */
async function checkSupabase(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUPABASE_CHECK_TIMEOUT_MS)
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('lojas')
      .select('id', { head: true, count: 'exact' })
      .abortSignal(controller.signal)
      .limit(1)
    return !error
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? 'local'
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'
  const timestamp = Date.now()

  const supabaseOk = await checkSupabase()
  const status = supabaseOk ? 'ok' : 'degraded'

  return NextResponse.json({
    status,
    deploymentId,
    gitSha,
    timestamp,
    checks: { supabase: supabaseOk ? 'ok' : 'fail' },
  })
}
