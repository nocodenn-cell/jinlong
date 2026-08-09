/**
 * Contrato das abas do módulo Estoque — puro (Server + Client safe).
 * Espelha o padrão de `financeiroTabs.ts`.
 */

import { ROUTES } from '@shared-core/navigation/routes'

export type EstoqueModuleTabId =
  | 'saldos'
  | 'recebimento'
  | 'transferencias'
  | 'importar-nfe'
  | 'etiquetas'

export type EstoqueModuleNavLabels = Readonly<{
  aria: string
  saldos: string
  recebimento: string
  transferencias: string
  importarNfe: string
  etiquetas: string
}>

export const ESTOQUE_MODULE_TABS: ReadonlyArray<{
  id: EstoqueModuleTabId
  href: string
  labelKey: keyof Omit<EstoqueModuleNavLabels, 'aria'>
}> = [
  { id: 'saldos', href: ROUTES.admin.estoque, labelKey: 'saldos' },
  { id: 'recebimento', href: ROUTES.admin.estoqueRecebimento, labelKey: 'recebimento' },
  { id: 'transferencias', href: ROUTES.admin.estoqueTransferencias, labelKey: 'transferencias' },
  { id: 'importar-nfe', href: ROUTES.admin.importNfe, labelKey: 'importarNfe' },
  { id: 'etiquetas', href: ROUTES.admin.estoqueImprimirEtiquetas, labelKey: 'etiquetas' },
]
