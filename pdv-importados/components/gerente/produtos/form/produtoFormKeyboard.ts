/**
 * Decisão pura dos atalhos de teclado do formulário de produto.
 * Fonte única para o handler do modal — testável sem renderizar a UI.
 *
 * - Ctrl/Cmd + Enter          → Publicar (salvar)
 * - Ctrl/Cmd + Shift + Enter  → Salvar e continuar (só na criação; na edição
 *   não existe "continuar", então retorna null)
 */
export type AcaoTecladoProduto = 'publicar' | 'salvar-continuar' | null

export function acaoTecladoProduto(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  opts: { editando: boolean },
): AcaoTecladoProduto {
  if (e.key !== 'Enter') return null
  if (!e.ctrlKey && !e.metaKey) return null
  if (e.shiftKey) {
    return opts.editando ? null : 'salvar-continuar'
  }
  return 'publicar'
}
