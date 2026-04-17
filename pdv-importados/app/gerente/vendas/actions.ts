'use server'

import { cancelarVenda } from '@/app/caixa/actions'

export async function cancelarVendaGerenteAction(formData: FormData) {
  const vendaId = String(formData.get('venda_id') ?? '').trim()
  const motivo = String(formData.get('motivo') ?? '').trim()
  if (!vendaId || !motivo) return
  await cancelarVenda(vendaId, motivo)
}
