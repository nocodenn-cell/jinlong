import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import { ImportarNfePageClient } from '@/app/gerente/estoque/importar-nfe/ImportarNfePageClient'

type PageProps = { searchParams?: Promise<{ importacao?: string }> }

// Deep-link `?importacao=<id>` (ex.: "NF-e #…" em Contas a pagar): abre a
// importação — aberta ou já concluída — em vez da tela de upload vazia. Um id
// inexistente ou de outra loja só produz o erro da própria action, sem quebrar
// a página.
export default async function AdminEstoqueImportarNfePage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.importNfe,
    resource: `route:${ROUTES.admin.importNfe}`,
  })
  const importacaoInicialId = (await searchParams)?.importacao?.trim() || null

  return (
    <div className="admin-v2-page">
      <EstoqueHubNav />
      <ImportarNfePageClient
        idioma={session.idioma}
        embeddedInAdminHub
        importacaoInicialId={importacaoInicialId}
      />
    </div>
  )
}
