import { ROUTES } from '@/lib/navigation/routes'
import type { HubTabDef } from './hubNavModel'

/** Hub Estoque — saldo e fluxos logísticos (rotas SSOT inalteradas). */
export const ESTOQUE_HUB_TABS: readonly HubTabDef[] = [
  { id: 'saldos', label: 'Saldos', href: ROUTES.admin.estoque, match: 'exact' },
  {
    id: 'recebimento',
    label: 'Recebimento',
    href: ROUTES.admin.estoqueRecebimento,
    match: 'prefix',
  },
  {
    id: 'transferencias',
    label: 'Transferências',
    href: ROUTES.admin.estoqueTransferencias,
    match: 'prefix',
  },
  { id: 'importar-nfe', label: 'Importar NF-e', href: ROUTES.admin.importNfe, match: 'prefix' },
  {
    id: 'etiquetas',
    label: 'Etiquetas',
    href: ROUTES.admin.estoqueImprimirEtiquetas,
    match: 'prefix',
  },
] as const
