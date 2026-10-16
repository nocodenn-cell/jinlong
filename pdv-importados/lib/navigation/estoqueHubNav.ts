import { ROUTES } from '@/lib/navigation/routes'
import type { HubTabDef } from './hubNavModel'

/**
 * Hub Estoque — o que JÁ está na loja (rotas SSOT inalteradas).
 * Entradas e etiquetas moram em Abastecer (`operationalHubNav` hub `compras`).
 */
export const ESTOQUE_HUB_TABS: readonly HubTabDef[] = [
  { id: 'saldos', label: 'Saldos', href: ROUTES.admin.estoque, match: 'exact' },
  { id: 'movimentacoes', label: 'Movimentações', href: ROUTES.admin.estoqueMovimentacoes, match: 'prefix' },
  {
    id: 'transferencias',
    label: 'Transferências',
    href: ROUTES.admin.estoqueTransferencias,
    match: 'prefix',
  },
] as const
