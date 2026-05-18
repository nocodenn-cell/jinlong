import { Suspense } from 'react'
import Link from 'next/link'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { ComissoesPageClient } from './ComissoesPageClient'

export default async function ComissoesPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
          ← {m.gerente.inicio}
        </Link>
      </div>

      <Suspense fallback={null}>
        <ComissoesPageClient m={m} />
      </Suspense>
    </div>
  )
}
