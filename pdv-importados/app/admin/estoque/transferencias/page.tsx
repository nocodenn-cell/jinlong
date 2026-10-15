import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
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

  const [{ data: lojasRaw }, { data: produtosRaw }] = await Promise.all([
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

  return (
      <TransferenciasGerentePageClient
        idioma={idioma}
        perfil={session.perfil}
        lojas={lojas}
        produtos={produtos}
        embeddedInAdminHub
      />
  )
}
