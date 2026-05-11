/** Validações puras — cadastro clientes/fornecedores no painel. */

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

export function validarNomeContato(nome: string): string | null {
  if (!nome?.trim()) return 'Nome obrigatório'
  return null
}

export function validarDocumentoClienteOpcional(documento: string | undefined): string | null {
  if (documento === undefined || documento.trim() === '') return null
  const d = somenteDigitos(documento)
  if (d.length < 11 || d.length > 14) return 'Documento deve ter entre 11 e 14 dígitos'
  return null
}

export function validarCnpjFornecedor(cnpj: string): string | null {
  const d = somenteDigitos(cnpj)
  if (d.length < 11 || d.length > 14) return 'CNPJ/CPF deve ter entre 11 e 14 dígitos'
  return null
}
