import type { EstoqueModuleNavLabels } from './estoqueModuleNav'

export function estoqueNavLabelsFromUi(ui: {
  estoque_nav_aria: string
  estoque_nav_saldos: string
  estoque_nav_recebimento: string
  estoque_nav_transferencias: string
  estoque_nav_importar_nfe: string
  estoque_nav_etiquetas: string
}): EstoqueModuleNavLabels {
  return {
    aria: ui.estoque_nav_aria,
    saldos: ui.estoque_nav_saldos,
    recebimento: ui.estoque_nav_recebimento,
    transferencias: ui.estoque_nav_transferencias,
    importarNfe: ui.estoque_nav_importar_nfe,
    etiquetas: ui.estoque_nav_etiquetas,
  }
}
