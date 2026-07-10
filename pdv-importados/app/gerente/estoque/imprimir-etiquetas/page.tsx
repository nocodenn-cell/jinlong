import { redirect } from 'next/navigation'
import { adminEtiquetasProdutoQuery } from '@shared-core/navigation/routes'

type SearchParams = { codigo?: string; produto?: string }

type PageProps = { searchParams?: Promise<SearchParams> }

/** Legado — mesma tela em /admin/estoque/imprimir-etiquetas. */
export default async function GerenteImprimirEtiquetasRedirectPage({ searchParams }: PageProps) {
  const sp = (searchParams ? await searchParams : {}) ?? {}
  redirect(
    adminEtiquetasProdutoQuery({
      codigo: typeof sp.codigo === 'string' ? sp.codigo : undefined,
      produtoId: typeof sp.produto === 'string' ? sp.produto : undefined,
    }),
  )
}
