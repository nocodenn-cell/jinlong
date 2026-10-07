/**
 * Atalhos de produtos sem código (grade esquerda do PDV).
 * Cada item dispara a mesma busca/adição do código de barras (`codigo`).
 * Lojas substituem esta lista pelos SKUs/códigos reais dos itens avulsos.
 */

export type AtalhoProdutoCaixa = {
  id: string
  label: string
  /** Código de barras, SKU ou termo de busca enviado ao pipeline. */
  codigo: string
}

/**
 * Grade padrão — códigos placeholder; o operador vê a grade e a busca
 * resolve candidatos pelo nome/código cadastrado no catálogo.
 */
export const CAIXA_ATALHOS_PRODUTOS_PADRAO: readonly AtalhoProdutoCaixa[] = [
  { id: 'agua', label: 'Água', codigo: 'agua' },
  { id: 'sacola', label: 'Sacola', codigo: 'sacola' },
  { id: 'cafe', label: 'Café', codigo: 'cafe' },
  { id: 'avulso', label: 'Avulso', codigo: 'avulso' },
] as const
