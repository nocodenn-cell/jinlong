import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { obterKpisCompras, listarOrdensCompra } from '@/app/gerente/compras/actions'
import { lojaIdDaSessao } from '@/app/gerente/fornecedores/fornecedorContrato'
import { ComprasContent } from './_components/ComprasContent'

const LIMITE_PAG = 20

type PageProps = { searchParams?: Promise<{ fornecedor?: string }> }

export default async function AdminComprasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.compras,
    resource: `route:${ROUTES.admin.compras}`,
  })

  const sp = (searchParams ? await searchParams : {}) ?? {}

  const tenant = lojaIdDaSessao(session)
  const supabase = await createClient()

  const fornQuery = tenant.ok
    ? supabase
        .from('fornecedores')
        .select('id, nome')
        .eq('loja_id', tenant.lojaId)
        .order('nome')
        .limit(500)
    : Promise.resolve({ data: [] as { id: string; nome: string }[] })

  const prodQuery = tenant.ok
    ? supabase
        .from('produtos')
        .select('id, nome, unidade_medida')
        .eq('ativo', true)
        .eq('loja_id', tenant.lojaId)
        .order('nome')
        .limit(500)
    : Promise.resolve({ data: [] as { id: string; nome: string; unidade_medida: string | null }[] })

  const [kpisIniciais, inicial, { data: fornecedoresRaw }, { data: produtosRaw }] = await Promise.all([
    obterKpisCompras(),
    listarOrdensCompra({ limite: LIMITE_PAG, offset: 0 }),
    fornQuery,
    prodQuery,
  ])

  const fornecedores = (fornecedoresRaw ?? []).map((f) => ({ id: f.id, nome: f.nome }))
  const produtos = (produtosRaw ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    unidade_medida: p.unidade_medida ?? 'UN',
  }))

  return (
    <div className="admin-v2-page">
      <ComprasContent
        idioma={session.idioma}
        kpisIniciais={kpisIniciais}
        inicial={inicial}
        fornecedores={fornecedores}
        produtos={produtos}
        fornecedorPreSelecionado={sp.fornecedor ?? null}
      />
    </div>
  )
}
