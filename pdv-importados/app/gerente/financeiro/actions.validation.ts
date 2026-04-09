/** Validações puras do financeiro — fora de `'use server'` para compatibilidade com Next (Server Actions só async). */

export function validarCriarClienteInput(input: { nome: string }): string | null {
  if (!input.nome?.trim()) return 'Nome obrigatório'
  return null
}

export function validarCriarTituloInput(input: {
  cliente_id: string
  valor_total: number
}): string | null {
  if (!input.cliente_id?.trim()) return 'Cliente obrigatório'
  if (!Number.isFinite(input.valor_total) || input.valor_total <= 0) return 'Valor inválido'
  return null
}

export function validarLiquidarTituloInput(input: {
  titulo_id: string
  valor: number
}): string | null {
  if (!input.titulo_id?.trim()) return 'Título obrigatório'
  if (!Number.isFinite(input.valor) || input.valor <= 0) return 'Valor inválido para liquidação'
  return null
}
