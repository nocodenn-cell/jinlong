import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactProviderPort } from '@shared-core/src/intelligence'
import { createCustomerFactProvider } from './customers/customer-fact-provider'
import { createApTitleFactProvider } from './financial/ap-title-fact-provider'
import { createArTitleFactProvider } from './financial/ar-title-fact-provider'
import { createInventoryMovementFactProvider } from './inventory/inventory-movement-fact-provider'
import { createStockPositionFactProvider } from './inventory/stock-position-fact-provider'
import { createProductFactProvider } from './products/product-fact-provider'
import { createProductPriceFactProvider } from './products/product-price-fact-provider'
import { createSaleFactProvider } from './sales/sale-fact-provider'
import { createSaleLineFactProvider } from './sales/sale-line-fact-provider'
import { createSalePaymentFactProvider } from './sales/sale-payment-fact-provider'
import { createSaleReturnFactProvider } from './sales/sale-return-fact-provider'
import { createSupplierFactProvider } from './suppliers/supplier-fact-provider'

/**
 * Factory Wave A — 12 FactProviders reais (I/O only).
 * Nenhum provider conhece KPI / Finding / Recommendation / UI.
 */
export function createWaveAProviders(
  supabase: SupabaseClient,
): readonly FactProviderPort[] {
  return [
    createSaleFactProvider(supabase),
    createSaleLineFactProvider(supabase),
    createSalePaymentFactProvider(supabase),
    createSaleReturnFactProvider(supabase),
    createStockPositionFactProvider(supabase),
    createInventoryMovementFactProvider(supabase),
    createProductFactProvider(supabase),
    createProductPriceFactProvider(supabase),
    createArTitleFactProvider(supabase),
    createApTitleFactProvider(supabase),
    createCustomerFactProvider(supabase),
    createSupplierFactProvider(supabase),
  ]
}
