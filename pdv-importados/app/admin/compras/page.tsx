import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { obterKpisCompras, listarOrdensCompra } from '@/app/gerente/compras/actions'
import { lojaIdDaSessao } from '@/app/gerente/fornecedores/fornecedorContrato'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import { ComprasContent } from './_components/ComprasContent'
import type { StatusOC } from '@/app/gerente/compras/actions'

const LIMITE_PAG = 20

const STATUS_OC: readonly StatusOC[] = [
  'RASCUNHO',
  'CONFIRMADA',
  'EM_TRANSITO',
  'RECEBIDA',
  'CANCELADA',
]

function statusDaUrl(raw: string | undefined): StatusOC | '' {
  return STATUS_OC.includes(raw as StatusOC) ? (raw as StatusOC) : ''
}

type SearchParams = {
  status?: string
  /** Busca por fornecedor, produto ou id. */
  q?: string
  /** Página 1-based. */
  page?: string
  /** Ordem a abrir já no carregamento — torna a OC endereçável. */
  oc?: string
}
type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminComprasPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.compras,
    resource: `route:${ROUTES.admin.compras}`,
  })

  const sp = (searchParams ? await searchParams : {}) ?? {}
  const statusInicial = statusDaUrl(sp.status)
  const buscaInicial = (sp.q ?? '').slice(0, 200)
  const paginaBruta = Number.parseInt(sp.page ?? '1', 10)
  const paginaInicial = Number.isFinite(paginaBruta) && paginaBruta >= 1 ? paginaBruta : 1
  // Validado como UUID para não repassar lixo da URL adiante.
  const ocInicial = /^[0-9a-f-]{36}$/i.test(sp.oc ?? '') ? (sp.oc as string) : null

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
    listarOrdensCompra({
      status: statusInicial || null,
      busca: buscaInicial,
      limite: LIMITE_PAG,
      offset: (paginaInicial - 1) * LIMITE_PAG,
    }),
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
      {/* Compras é uma aba do hub de Estoque (modelo do Bling: comprar é
          abastecer estoque) — sem o hub aqui, a aba levava a um beco sem
          volta para Entrada/Saldos. */}
      <EstoqueHubNav />
      {/* `useSearchParams` exige limite de Suspense — os filtros desta lista
          vivem na URL para preservar o contexto ao voltar do detalhe. */}
      <Suspense fallback={<div className="h-64" aria-busy />}>
        <ComprasContent
          idioma={session.idioma}
          kpisIniciais={kpisIniciais}
          inicial={inicial}
          fornecedores={fornecedores}
          produtos={produtos}
          statusInicial={statusInicial}
          buscaInicial={buscaInicial}
          paginaInicial={paginaInicial}
          ocInicial={ocInicial}
        />
      </Suspense>
    </div>
  )
}
