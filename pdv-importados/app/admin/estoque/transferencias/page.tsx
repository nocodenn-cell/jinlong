import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import {
  TransferenciasGerentePageClient,
  type TransferenciaLojaRow,
} from '@/app/gerente/transferencias/TransferenciasGerentePageClient'

export default async function AdminEstoqueTransferenciasPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoqueTransferencias,
    resource: `route:${ROUTES.admin.estoqueTransferencias}`,
  })
  const { idioma } = session
  const supabase = await createClient()

  // Sprint 1 / RFC-UX-004: produtos vêm via EntityLookup async — não pré-carregar 500.
  const { data: lojasRaw } = await supabase
    .from('lojas')
    .select('id, nome, codigo')
    .eq('ativo', true)
    .order('nome')

  const lojas: TransferenciaLojaRow[] = (lojasRaw ?? []).map((l) => ({
    id: l.id,
    nome: l.nome,
    codigo: l.codigo ?? '',
  }))

  return <TransferenciasGerentePageClient idioma={idioma} lojas={lojas} />
}
