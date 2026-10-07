import { ROUTES } from '@/lib/navigation/routes'
import type { HubTabDef } from './hubNavModel'

/** Hub Estoque — saldo e fluxos logísticos (rotas SSOT inalteradas). */
export const ESTOQUE_HUB_TABS: readonly HubTabDef[] = [
  { id: 'saldos', label: 'Saldos', href: ROUTES.admin.estoque, match: 'exact' },
  {
    id: 'recebimento',
    label: 'Entradas',
    href: ROUTES.admin.estoqueRecebimento,
    aliases: [ROUTES.admin.importNfe],
    match: 'prefix',
  },
  { id: 'movimentacoes', label: 'Movimentações', href: ROUTES.admin.estoqueMovimentacoes, match: 'prefix' },
  {
    id: 'transferencias',
    label: 'Transferências',
    href: ROUTES.admin.estoqueTransferencias,
    match: 'prefix',
  },
  {
    id: 'etiquetas',
    label: 'Etiquetas',
    href: ROUTES.admin.estoqueImprimirEtiquetas,
    match: 'prefix',
  },
] as const
