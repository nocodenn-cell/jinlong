import { useCallback, useRef } from "react"
import { calcularPrecoProdutoCaixa } from "@/app/caixa/actions"
import { useCarrinhoStore } from "@/stores/carrinhoStore"

/** Espera digitação "assentar" antes de chamar a RPC (evita 1 round-trip por tecla). */
const DEBOUNCE_MS = 350

export type TipoPrecoItemCaixa = "VAREJO" | "ATACADO" | "MANUAL" | "PROMOCAO"

export type ReprecificarQuantidadeInput = {
  itemId: string
  produtoId: string
  quantidade: number
  tipoPrecoAtual: TipoPrecoItemCaixa
  /** true = digitação no campo de quantidade (debounced); false = evento discreto (botão, dedupe de scan). */
  debounce?: boolean
}

/**
 * Recalcula o preço unitário de um item já no carrinho quando a quantidade
 * muda, via RPC `calcular_preco_produto` — a mesma autoridade usada no scan
 * inicial e na revalidação de finalização (migration 250 / 243).
 *
 * Não recalcula linhas MANUAL/PROMOCAO (preço já é uma decisão manual/override).
 * Falha de rede não bloqueia a alteração de quantidade: o preço exibido fica
 * desatualizado até a próxima tentativa, mas a finalização revalida no commit.
 */
export function useReprecificarQuantidadeCaixa() {
  const sincronizarPrecoCalculadoRpc = useCarrinhoStore((s) => s.sincronizarPrecoCalculadoRpc)
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  /** Sequência por item: descarta respostas de chamadas antigas quando a quantidade muda de novo antes do round-trip voltar. */
  const sequenciaRef = useRef(new Map<string, number>())

  const executar = useCallback(
    async (itemId: string, produtoId: string, quantidade: number) => {
      const seq = (sequenciaRef.current.get(itemId) ?? 0) + 1
      sequenciaRef.current.set(itemId, seq)

      const res = await calcularPrecoProdutoCaixa({ produtoId, quantidade })

      if (sequenciaRef.current.get(itemId) !== seq) return
      if (!res.ok) return

      sincronizarPrecoCalculadoRpc(itemId, { precoUnitario: res.preco, tipoPreco: res.tipo })
    },
    [sincronizarPrecoCalculadoRpc],
  )

  const reprecificar = useCallback(
    ({ itemId, produtoId, quantidade, tipoPrecoAtual, debounce = false }: ReprecificarQuantidadeInput) => {
      if (tipoPrecoAtual === "MANUAL" || tipoPrecoAtual === "PROMOCAO") return
      if (!Number.isFinite(quantidade) || quantidade <= 0) return

      const timers = timersRef.current
      const timerAnterior = timers.get(itemId)
      if (timerAnterior) clearTimeout(timerAnterior)

      if (!debounce) {
        void executar(itemId, produtoId, quantidade)
        return
      }

      const timer = setTimeout(() => {
        timers.delete(itemId)
        void executar(itemId, produtoId, quantidade)
      }, DEBOUNCE_MS)
      timers.set(itemId, timer)
    },
    [executar],
  )

  return { reprecificar }
}
