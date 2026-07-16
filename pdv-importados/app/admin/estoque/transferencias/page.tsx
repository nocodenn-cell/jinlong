import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import {
  TransferenciasGerentePageClient,
  type TransferenciaLojaRow,
  type TransferenciaProdutoOpt,
} from '@/app/gerente/transferencias/TransferenciasGerentePageClient'

export default async function AdminEstoqueTransferenciasPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoqueTransferencias,
    resource: `route:${ROUTES.admin.estoqueTransferencias}`,
  })
  const { idioma } = session
  const supabase = await createClient()

  const [{ data: lojasRaw, error: lojasErr }, { data: produtosRaw, error: produtosErr }] = await Promise.all([
    supabase
      .from('lojas')
      .select('id, nome, codigo')
      .eq('ativo', true)
      .order('nome'),
    supabase
      .from('produtos')
      .select('id, nome, unidade_medida, limite_transferencia_sem_observacao')
      .eq('ativo', true)
      .order('nome')
      .limit(500),
  ])

  const lojas: TransferenciaLojaRow[] = (lojasRaw ?? []).map((l) => ({
    id: l.id,
    nome: l.nome,
    codigo: l.codigo ?? '',
  }))

  const produtos: TransferenciaProdutoOpt[] = (produtosRaw ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    unidade_medida: p.unidade_medida,
    limite_transferencia_sem_observacao: p.limite_transferencia_sem_observacao,
  }))

  // lojasErr/produtosErr: falha real de carga (RLS, rede) — distinto de "só existe
  // 1 loja". Sem isso o operador via o aviso errado ("cadastre outra loja") quando
  // na verdade a consulta falhou.
  const loadError =
    lojasErr || produtosErr
      ? 'Não foi possível carregar lojas/produtos para transferência. Tente novamente.'
      : null

  return (
    <TransferenciasGerentePageClient
      idioma={idioma}
      lojas={lojas}
      produtos={produtos}
      loadError={loadError}
    />
  )
}
