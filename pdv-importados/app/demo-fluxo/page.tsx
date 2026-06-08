import { notFound, redirect } from 'next/navigation'
import { DemoFluxoClient } from '@/app/demo-fluxo/DemoFluxoClient'
import { obterContextoDemoFluxo } from '@/app/demo-fluxo/actions'
import { isDemoFluxoEnabled } from '@/lib/demo/isDemoFluxoEnabled'
import { createClient } from '@/lib/supabase/server'

export default async function DemoFluxoPage() {
  if (!isDemoFluxoEnabled()) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/demo-fluxo')
  }

  const contexto = await obterContextoDemoFluxo()

  return (
    <main className="min-h-screen bg-[var(--admin-v2-bg,theme(colors.gray.50))]">
      <DemoFluxoClient contextoInicial={contexto} />
    </main>
  )
}
