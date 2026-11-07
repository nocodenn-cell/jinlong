import { bloqueioPorPlano } from '@/lib/cobranca/bloqueioPorPlano'
import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import {
  TransferenciasGerentePageClient,
  type TransferenciaLojaRow,
  type TransferenciaProdutoOpt,
} from '@/app/gerente/transferencias/TransferenciasGerentePageClient'

export default async function AdminEstoqueTransferenciasPage() {
  const bloqueio = await bloqueioPorPlano('transferencias')
  if (bloqueio) return bloqueio
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
    <div className="admin-v2-page">
      <TransferenciasGerentePageClient
        hubNav={<EstoqueHubNav />}
        idioma={idioma}
        lojas={lojas}
        produtos={produtos}
        embeddedInAdminHub
      />
    </div>
  )
}
