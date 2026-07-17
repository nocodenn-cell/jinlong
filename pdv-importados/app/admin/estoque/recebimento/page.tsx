import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import {
  RecebimentoGerentePageClient,
  type RecebimentoProdutoOpt,
  type RemessaRecenteRow,
} from '@/app/gerente/recebimento/RecebimentoGerentePageClient'

export default async function AdminEstoqueRecebimentoPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoqueRecebimento,
    resource: `route:${ROUTES.admin.estoqueRecebimento}`,
  })
  const { idioma, lojaId } = session
  const supabase = await createClient()

  const [{ data: produtosRaw, error: produtosErr }, { data: remessasRaw, error: remessasErr }] = await Promise.all([
    supabase
      .from('produtos')
      .select('id, nome, codigo_barras')
      .eq('ativo', true)
      .order('nome')
      .limit(500),
    lojaId
      ? supabase
          .from('remessas')
          .select('id, origem_descricao, status, created_at')
          .eq('loja_id', lojaId)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
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

  // produtosErr/remessasErr: falha real de carga (RLS, rede) — distinto de "nenhum
  // produto cadastrado". Sem isso o operador via o aviso errado ("cadastre
  // produtos") quando na verdade a consulta falhou (mesmo bug já corrigido em
  // Kardex e Transferências nesta fase).
  const loadError =
    produtosErr || remessasErr
      ? 'Não foi possível carregar produtos/remessas para recebimento. Tente novamente.'
      : null

  return (
    <RecebimentoGerentePageClient
      idioma={idioma}
      produtos={produtos}
      remessasRecentes={remessasRecentes}
      loadError={loadError}
    />
  )
}
