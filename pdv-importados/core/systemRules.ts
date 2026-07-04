/**
 * SYSTEM RULES — "Constitution File": CONFIGURAÇÃO DECLARATIVA do sistema.
 *
 * A DECISÃO de negócio vive no motor único `shared-core/src/engine/productEngine`.
 * Aqui só descrevemos as regras (dado declarativo) referenciando esse motor —
 * nada é reimplementado. Puro: sem React/UI/DB.
 *
 * Modelo: CORE (decide, productEngine) → SERVER (executa) → UI (apresenta).
 */

import {
  PRODUCT_RULES,
  statusInicialProduto,
  evaluateProduct,
} from '@shared-core/src/domain/product/engine'
import type { ProdutoOrigem } from '@shared-core/src/domain/product/types'

// Reexporta o motor para os consumidores (server actions etc.).
export { statusInicialProduto, evaluateProduct }
export type { ProdutoOrigem }

export const SYSTEM_RULES = {
  product: {
    createdByHuman: PRODUCT_RULES.createdByHuman,
    createdByImport: PRODUCT_RULES.createdByImport,
  },
  pdv: {
    vendavel: { requires: PRODUCT_RULES.vendavel },
    flow: ['adicionar_item', 'validar_sku', 'calcular_total', 'finalizar_venda'],
  },
  forbidden: {
    businessLogicOutsideCore: true,
    duplicatedRules: true,
    uiBusinessLogic: true,
  },
} as const
