"use client"

import { useState, useEffect, useCallback, FormEvent } from "react"
import { useCarrinhoStore } from "@/stores/carrinhoStore"
import {
  carregarRegrasPrecoCaixa,
  buscarProdutoParaCaixa,
} from "@/app/caixa/actions"

export default function CaixaPage() {
  const [codigo, setCodigo] = useState("")
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [carregandoRegras, setCarregandoRegras] = useState(true)
  const [buscando, setBuscando] = useState(false)

  const {
    itens,
    totalBruto,
    totalDesconto,
    totalLiquido,
    totalItens,
    totalUnidades,
    setRegras,
    adicionarItem,
    alterarQuantidade,
    removerItem,
    limparCarrinho,
  } = useCarrinhoStore()

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setCarregandoRegras(true)
      const res = await carregarRegrasPrecoCaixa()
      if (cancelado) return
      if (res.ok) {
        setRegras(res.regras)
        setMensagem(null)
      } else {
        setMensagem(`Regras de preço: ${res.error}`)
        setRegras([])
      }
      setCarregandoRegras(false)
    })()
    return () => {
      cancelado = true
    }
  }, [setRegras])

  const handleAdicionar = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = codigo.trim()
      if (!trimmed) return

      setBuscando(true)
      setMensagem(null)

      try {
        const res = await buscarProdutoParaCaixa(trimmed)

        if (!res.ok) {
          setMensagem(res.error)
          setBuscando(false)
          return
        }

        if (res.status === "nao_encontrado") {
          setMensagem("Produto não encontrado (código ou nome).")
          setBuscando(false)
          return
        }

        if (res.status === "ambiguo") {
          setMensagem(res.mensagem)
          setBuscando(false)
          return
        }

        const p = res.produto
        const avisoEstoque =
          p.quantidade_estoque !== null && p.quantidade_estoque < 1
            ? " Atenção: estoque baixo ou zero."
            : ""

        adicionarItem({
          id: `${p.id}-${Date.now()}`,
          produtoId: p.id,
          nome: p.nome,
          quantidade: 1,
          precoVariejo: p.preco_varejo,
          categoriaId: p.categoria_id ?? undefined,
        })

        setCodigo("")
        if (avisoEstoque) {
          setMensagem(`Adicionado.${avisoEstoque}`)
        } else {
          setMensagem(null)
        }
      } catch {
        setMensagem("Falha ao buscar produto. Verifique a conexão.")
      } finally {
        setBuscando(false)
      }
    },
    [codigo, adicionarItem],
  )

  const handleAlterarQuantidade = useCallback(
    (itemId: string, quantidade: number) => {
      if (Number.isNaN(quantidade)) return
      alterarQuantidade(itemId, quantidade)
    },
    [alterarQuantidade],
  )

  const handleRemover = useCallback(
    (itemId: string) => {
      removerItem(itemId)
    },
    [removerItem],
  )

  const handleNovoCupom = useCallback(() => {
    limparCarrinho()
    setCodigo("")
    setMensagem(null)
  }, [limparCarrinho])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 flex flex-col">
      <header className="px-6 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="text-sm">
          <div className="font-semibold">PDV · Caixa</div>
          <div className="text-xs text-slate-400">
            {new Date().toLocaleString("pt-BR")}
          </div>
        </div>
        <div className="text-xs text-slate-400 text-right">
          <div>F5 Dinheiro · F9 PIX · F10 Cartão (placeholder)</div>
          <div>
            Catálogo Supabase · regras em{" "}
            <code className="text-slate-500">regras_preco</code>
            {carregandoRegras ? " · carregando regras…" : ""}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col px-6 py-4 gap-4">
        <form onSubmit={handleAdicionar} className="flex gap-3">
          <input
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código de barras ou parte do nome do produto..."
            disabled={buscando || carregandoRegras}
            className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={buscando || carregandoRegras}
            className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold disabled:opacity-50"
          >
            {buscando ? "Buscando…" : "Adicionar (Enter)"}
          </button>
          <button
            type="button"
            onClick={handleNovoCupom}
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm"
          >
            Novo cupom
          </button>
        </form>

        {mensagem && (
          <div className="text-xs text-amber-300 mt-1">{mensagem}</div>
        )}

        <section className="flex-1 flex flex-col rounded-md border border-slate-800 bg-slate-950/60 overflow-hidden">
          <header className="grid grid-cols-[3fr,0.7fr,0.9fr,0.9fr,0.9fr] gap-2 px-3 py-2 text-xs text-slate-400 border-b border-slate-800">
            <span>Produto</span>
            <span className="text-right">Qtde</span>
            <span className="text-right">Unit.</span>
            <span className="text-right">Total</span>
            <span className="text-right">Tipo</span>
          </header>

          <div className="flex-1 overflow-auto">
            {itens.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">
                Nenhum item no carrinho. Escaneie um código cadastrado em{" "}
                <span className="mx-1 font-mono text-slate-400">produtos</span> ou
                digite parte do nome (Enter).
              </div>
            ) : (
              <ul className="divide-y divide-slate-800 text-sm">
                {itens.map((item) => (
                  <li
                    key={item.id}
                    className="grid grid-cols-[3fr,0.7fr,0.9fr,0.9fr,0.9fr] gap-2 px-3 py-2 items-center"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{item.nome}</span>
                      <span className="text-xs text-slate-500">
                        ID: {item.produtoId}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) =>
                          handleAlterarQuantidade(
                            item.id,
                            Number(e.target.value),
                          )
                        }
                        className="w-16 text-right bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemover(item.id)}
                        className="text-[11px] text-slate-500 hover:text-red-400"
                      >
                        remover
                      </button>
                    </div>

                    <div className="text-right tabular-nums">
                      R${" "}
                      {item.resultado.precoOriginal.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>

                    <div className="text-right tabular-nums">
                      R${" "}
                      {(
                        item.resultado.precoUnitario * item.quantidade
                      ).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>

                    <div className="text-right">
                      {item.resultado.tipoPreco === "ATACADO" && (
                        <span className="inline-flex items-center justify-end rounded-full bg-emerald-600/15 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          ATACADO
                        </span>
                      )}
                      {item.resultado.tipoPreco === "VAREJO" && (
                        <span className="inline-flex items-center justify-end rounded-full bg-slate-700/40 border border-slate-500/40 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                          VAREJO
                        </span>
                      )}
                      {item.resultado.tipoPreco === "MANUAL" && (
                        <span className="inline-flex items-center justify-end rounded-full bg-amber-600/20 border border-amber-500/50 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                          MANUAL
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <footer className="mt-2 flex items-center justify-between text-sm">
          <div className="text-xs text-slate-400">
            {totalItens} itens · {totalUnidades} unidades
          </div>
          <div className="flex items-end gap-8">
            <div className="text-right text-xs text-slate-300">
              <div>Bruto</div>
              <div className="text-base font-semibold tabular-nums">
                R${" "}
                {totalBruto.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="text-right text-xs text-emerald-300">
              <div>Descontos (atacado/manual)</div>
              <div className="text-base font-semibold tabular-nums">
                - R${" "}
                {totalDesconto.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">Total a pagar</div>
              <div className="text-2xl font-bold tabular-nums text-emerald-400">
                R${" "}
                {totalLiquido.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
