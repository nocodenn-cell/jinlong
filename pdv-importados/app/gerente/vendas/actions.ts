'use server'

import { cancelarVenda } from '@/app/caixa/actions'
import { parseCancelarVendaGerenteForm } from '@/app/gerente/vendas/parseCancelarVendaGerenteForm'

export async function cancelarVendaGerenteAction(formData: FormData) {
  const parsed = parseCancelarVendaGerenteForm(formData)
  if (!parsed) return
  await cancelarVenda(parsed.vendaId, parsed.motivo)
}
