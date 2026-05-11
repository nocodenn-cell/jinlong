/** Validações puras — cadastro de vendedores. */

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

export function validarCodigoVendedor(codigo: string): string | null {
  if (!codigo?.trim()) return 'Código obrigatório'
  return null
}

export function validarNomeVendedor(nome: string): string | null {
  if (!nome?.trim()) return 'Nome obrigatório'
  return null
}

export function validarCpfVendedorOpcional(cpf: string | undefined): string | null {
  if (cpf === undefined || cpf.trim() === '') return null
  const d = somenteDigitos(cpf)
  if (d.length !== 11) return 'CPF deve ter 11 dígitos'
  return null
}

export function validarCelularVendedorOpcional(celular: string | undefined): string | null {
  if (celular === undefined || celular.trim() === '') return null
  const d = somenteDigitos(celular)
  if (d.length < 10 || d.length > 13) return 'Celular deve ter entre 10 e 13 dígitos'
  return null
}
