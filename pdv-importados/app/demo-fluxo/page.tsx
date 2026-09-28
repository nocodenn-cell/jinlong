import { notFound, redirect } from 'next/navigation'
import { DemoFluxoClient } from '@/app/demo-fluxo/DemoFluxoClient'
import { obterContextoDemoFluxo } from '@/app/demo-fluxo/actions'
import { isDemoFluxoEnabled } from '@/lib/demo/isDemoFluxoEnabled'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'

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

  const [contexto, { idioma }] = await Promise.all([
    obterContextoDemoFluxo(),
    getUsuarioIdioma(),
  ])

  return (
    <main className="min-h-screen bg-[var(--admin-v2-bg,theme(colors.gray.50))]">
      <AdminV2SessionProvider idioma={idioma}>
        <DemoFluxoClient contextoInicial={contexto} />
      </AdminV2SessionProvider>
    </main>
  )
}
