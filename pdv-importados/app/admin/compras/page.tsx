import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { obterKpisCompras, listarOrdensCompra } from '@/app/gerente/compras/actions'
import { ComprasContent } from './_components/ComprasContent'

const LIMITE_PAG = 20

export default async function AdminComprasPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.compras,
    resource: `route:${ROUTES.admin.compras}`,
  })

  const supabase = await createClient()

  const [kpisIniciais, inicial, { data: fornecedoresRaw }, { data: produtosRaw }] = await Promise.all([
    obterKpisCompras(),
    listarOrdensCompra({ limite: LIMITE_PAG, offset: 0 }),
    supabase.from('fornecedores').select('id, nome').order('nome').limit(500),
    supabase.from('produtos').select('id, nome, unidade_medida').eq('ativo', true).order('nome').limit(500),
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
      />
    </div>
  )
}
