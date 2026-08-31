import type { BuscarProdutoResult, ProdutoCaixaDTO } from '@/app/caixa/caixaActionTypes'

/**
 * Heurística anti-interferência com leitor USB (wedge): rajadas de dígitos
 * longas são barcode — não disparamos typeahead (debounce atrasaria o Enter).
 */
export function pareceLeituraBarcode(termo: string): boolean {
  return /^\d{6,}$/.test(termo.trim())
}

export function deveBuscarSugestoes(termo: string): boolean {
  const t = termo.trim()
  if (t.length < 2) return false
  if (pareceLeituraBarcode(t)) return false
  return true
}

export type PayloadSugestoesCaixa = Readonly<{
  mensagem: string
  itens: ProdutoCaixaDTO[]
}>

/** Converte o resultado canônico da busca em lista de sugestões (ID 5). */
export function sugestoesDeResultadoBusca(
  res: BuscarProdutoResult,
  mensagemUnico: string,
): PayloadSugestoesCaixa | null {
  if (!res.ok) return null
  if (res.status === 'ambiguo' && res.candidatos.length > 0) {
    return { mensagem: res.mensagem, itens: res.candidatos }
  }
  if (res.status === 'encontrado') {
    return { mensagem: mensagemUnico, itens: [res.produto] }
  }
  return null
}
