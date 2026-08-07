"use client"

import { useEffect, useRef } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { ProdutoCaixaResumoDTO } from "@/app/caixa/caixaActionTypes"
import { formatDecimal2 } from "@/lib/format/money"
import { caixaFmt } from "@/app/caixa/caixaI18n"

/**
 * Seletor de candidatos da busca do PDV — popup de um combobox.
 *
 * Aparece quando o termo digitado casa com mais de um produto (`status:
 * 'multiplos'`). Componente **puramente apresentacional**: não guarda foco nem
 * estado de navegação (o campo de busca continua com o foco, para que o
 * operador refine o termo sem clicar) e não decide preço. O `preco_varejo`
 * exibido é referência de vitrine — o preço autoritativo (varejo/atacado por
 * quantidade) é resolvido no servidor depois da escolha.
 */

export const CAIXA_RESULTADOS_LISTBOX_ID = "caixa-resultados-busca-listbox"

/** Id do item ativo — consumido por `aria-activedescendant` no input da busca. */
export function caixaResultadoOptionId(indice: number): string {
  return `caixa-resultado-opcao-${indice}`
}

type Props = {
  m: Mensagens
  idioma: Idioma
  produtos: ProdutoCaixaResumoDTO[]
  /** Índice destacado, controlado por quem detém o foco (o campo de busca). */
  ativo: number
  moeda: string
  onEscolher: (produto: ProdutoCaixaResumoDTO) => void
  onAtivoChange: (indice: number) => void
  onFechar: () => void
}

function listLocale(idioma: Idioma): string {
  return idioma === "pt" ? "pt-BR" : "zh-CN"
}

/** Chips de estoque — mesma escala de contraste dos chips do carrinho. */
const CHIP_ESTOQUE_OK =
  "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-strong)]"
const CHIP_ESTOQUE_ATENCAO =
  "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]"
const CHIP_ESTOQUE_ZERO =
  "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]"
const CHIP_ESTOQUE_NEUTRO = "border-border bg-muted text-muted-foreground"

function classeEstoque(produto: ProdutoCaixaResumoDTO): string {
  const q = produto.quantidade_estoque
  if (q === null) return CHIP_ESTOQUE_NEUTRO
  if (q <= 0) return CHIP_ESTOQUE_ZERO
  const min = produto.estoque_minimo
  if (min !== null && q <= min) return CHIP_ESTOQUE_ATENCAO
  return CHIP_ESTOQUE_OK
}

export function CaixaResultadosBusca({
  m,
  idioma,
  produtos,
  ativo,
  moeda,
  onEscolher,
  onAtivoChange,
  onFechar,
}: Props) {
  const itemAtivoRef = useRef<HTMLLIElement>(null)
  const locale = listLocale(idioma)

  // Mantém o item destacado visível quando a navegação por ↑/↓ passa do fim da
  // área rolável — o foco está no input, então o browser não rola sozinho.
  useEffect(() => {
    itemAtivoRef.current?.scrollIntoView({ block: "nearest" })
  }, [ativo])

  if (produtos.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-foreground">
          {caixaFmt(m.caixa.busca_multiplos_titulo, { n: produtos.length })}
        </span>
        <button
          type="button"
          onClick={onFechar}
          className="shrink-0 text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {m.caixa.busca_multiplos_fechar}
        </button>
      </div>

      <ul
        id={CAIXA_RESULTADOS_LISTBOX_ID}
        role="listbox"
        aria-label={caixaFmt(m.caixa.busca_multiplos_titulo, { n: produtos.length })}
        className="max-h-64 divide-y divide-border overflow-y-auto"
      >
        {produtos.map((p, i) => {
          const selecionado = i === ativo
          return (
            <li
              key={p.id}
              ref={selecionado ? itemAtivoRef : undefined}
              id={caixaResultadoOptionId(i)}
              role="option"
              aria-selected={selecionado}
            >
              <button
                type="button"
                // O input da busca precisa manter o foco para o operador poder
                // refinar o termo — por isso o clique não pode transferi-lo.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onEscolher(p)}
                onMouseEnter={() => onAtivoChange(i)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                  selecionado ? "bg-primary/10" : "hover:bg-accent/50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {p.nome}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {p.codigo_barras ?? m.caixa.busca_multiplos_sem_codigo}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${classeEstoque(p)}`}
                >
                  {p.quantidade_estoque === null
                    ? m.caixa.cart_estoque_sem_controle
                    : `${m.caixa.cart_estoque_label} ${p.quantidade_estoque}`}
                </span>
                <span className="shrink-0 tabular-nums text-sm font-semibold text-foreground">
                  {moeda} {formatDecimal2(p.preco_varejo, locale)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        {m.caixa.busca_multiplos_hint}
      </p>
    </div>
  )
}
