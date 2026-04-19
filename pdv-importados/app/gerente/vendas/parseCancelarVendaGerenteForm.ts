/** Leitura pura do FormData de cancelamento (testável sem Supabase). */
export function parseCancelarVendaGerenteForm(
  formData: FormData,
): { vendaId: string; motivo: string } | null {
  const vendaId = (formData.get('venda_id')?.toString() ?? '').trim()
  const motivo = (formData.get('motivo')?.toString() ?? '').trim()
  if (!vendaId || !motivo) return null
  return { vendaId, motivo }
}
