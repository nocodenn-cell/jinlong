import { useCarrinhoStore } from '@/stores/carrinhoStore'

/**
 * Zera o carrinho em memória e remove a entrada persistida (`localStorage`).
 * Deve ser chamado após logout (manual ou por inatividade) para não vazar estado entre sessões no mesmo terminal.
 */
export function resetCarrinhoPersistido(): void {
  try {
    useCarrinhoStore.getState().limparCarrinho()
    const p = useCarrinhoStore.persist
    if (p && typeof p.clearStorage === 'function') {
      void p.clearStorage()
    }
  } catch {
    /* ignore: hidratação ou ambiente sem storage */
  }
}
