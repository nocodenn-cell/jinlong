/**
 * Executa a leitura de UMA seção da página sem derrubar a página inteira.
 *
 * Falha ⇒ devolve `fallback` com `falhou: true` e registra o erro no log do servidor
 * (sem dados de cliente: só o rótulo da seção e a mensagem da falha).
 */
export type Resultado<T> = { value: T; falhou: boolean }

export async function tentar<T>(rotulo: string, fn: () => Promise<T>, fallback: T): Promise<Resultado<T>> {
  try {
    return { value: await fn(), falhou: false }
  } catch (e) {
    console.error(`[hub] ${rotulo} falhou:`, e instanceof Error ? e.message : e)
    return { value: fallback, falhou: true }
  }
}
