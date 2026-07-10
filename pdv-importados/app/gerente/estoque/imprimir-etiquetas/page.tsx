import { resolveAdminSession } from '@/lib/admin/auth/resolveAdminSession'
import { redirect } from 'next/navigation'
import { ImprimirEtiquetasPageClient } from './ImprimirEtiquetasPageClient'

type SearchParams = { codigo?: string; produto?: string }

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function GerenteImprimirEtiquetasPage({ searchParams }: PageProps) {
  const session = await resolveAdminSession()
  if (!session) redirect('/login')

  const sp = (searchParams ? await searchParams : {}) ?? {}

  return (
    <ImprimirEtiquetasPageClient
      idioma={session.idioma}
      initialCodigo={typeof sp.codigo === 'string' ? sp.codigo : undefined}
      initialProdutoId={typeof sp.produto === 'string' ? sp.produto : undefined}
    />
  )
}
