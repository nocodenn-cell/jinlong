import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import {
  RecebimentoGerentePageClient,
  type RecebimentoProdutoOpt,
  type RemessaRecenteRow,
} from '@/app/gerente/recebimento/RecebimentoGerentePageClient'
import { buscarProdutoRecebimentoPorId } from '@/app/gerente/recebimento/actions'

type PageProps = { searchParams?: Promise<{ produto?: string }> }

export default async function AdminEstoqueRecebimentoPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoqueRecebimento,
    resource: `route:${ROUTES.admin.estoqueRecebimento}`,
  })
  const { idioma, lojaId } = session
  const supabase = await createClient()
  const produtoIdPreSelecionado = (await searchParams)?.produto

  const [{ data: produtosRaw }, { data: remessasRaw }] = await Promise.all([
    // Só precisamos saber SE existe produto — a escolha agora é por busca
    // server-side (ProdutoRecebimentoAutocomplete). Antes vinham 500 linhas
    // para popular um `<select>` que escondia todo o resto do catálogo.
    //
    // Escopo de loja igual ao da busca (`buscarProdutosRecebimento`): sem ele a
    // presença era global e o formulário aparecia habilitado em loja cujo
    // catálogo está vazio, com a busca não retornando nada.
    lojaId
      ? supabase
          .from('produtos')
          .select('id, nome, codigo_barras')
          .eq('loja_id', lojaId)
          .order('nome')
          .limit(1)
      : Promise.resolve({ data: [] }),
    lojaId
      ? supabase
          .from('remessas')
          .select('id, origem_descricao, status, created_at')
          .eq('loja_id', lojaId)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ])

  const produtos: RecebimentoProdutoOpt[] = (produtosRaw ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    codigo_barras: p.codigo_barras,
  }))

  const remessasRecentes: RemessaRecenteRow[] = (remessasRaw ?? []).map((r) => ({
    id: r.id,
    origem_descricao: r.origem_descricao,
    status: r.status,
    created_at: r.created_at,
  }))

  // Deep-link "Repor" a partir do estoque crítico (`/admin/estoque`): produto
  // inválido, de outra loja ou inativo cai de volta para a busca manual, sem
  // quebrar a página.
  let produtoPreSelecionado: RecebimentoProdutoOpt | null = null
  if (produtoIdPreSelecionado) {
    const r = await buscarProdutoRecebimentoPorId(produtoIdPreSelecionado)
    if (r.success) produtoPreSelecionado = r.data
  }

  return (
    <div className="admin-v2-page">
      <EstoqueHubNav />
      <RecebimentoGerentePageClient
        idioma={idioma}
        produtos={produtos}
        remessasRecentes={remessasRecentes}
        produtoPreSelecionado={produtoPreSelecionado}
        embeddedInAdminHub
      />
    </div>
  )
}
