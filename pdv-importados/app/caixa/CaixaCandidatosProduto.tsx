"use client"

import { useEffect, useRef } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { ProdutoCaixaDTO } from "@/app/caixa/caixaActionTypes"
import { formatBRL, moneyLocale } from "@/lib/format/money"
import { cn } from "@/lib/utils"

/**
 * Lista de candidatos numa busca ambígua por nome/categoria (Onda 2 · Bloco 1).
 *
 * Densidade: NOME (destaque) + diferenciador (código de barras ou interno,
 * o que existir) + preço + estoque só quando baixo/zero — sem virar ficha de
 * produto. Navegação por teclado é responsabilidade do campo de busca
 * (`CaixaSearchBar`); este componente só reflete `ativoIndex` visualmente e
 * aceita clique/hover.
 */
type Props = {
  m: Mensagens
  idioma: Idioma
  mensagem: string
  itens: ProdutoCaixaDTO[]
  ativoIndex: number
  onHoverIndex: (i: number) => void
  onSelecionar: (produto: ProdutoCaixaDTO) => void
}

function diferenciador(p: ProdutoCaixaDTO): string | null {
  return p.codigo_barras ?? p.codigo_interno ?? null
}

export function CaixaCandidatosProduto({ m, idioma, mensagem, itens, ativoIndex, onHoverIndex, onSelecionar }: Props) {
  const locale = moneyLocale(idioma)
  const ativoRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    ativoRef.current?.scrollIntoView({ block: "nearest" })
  }, [ativoIndex])

  return (
    <div
      id="caixa-candidatos-listbox"
      role="listbox"
      aria-label={m.caixa.candidatos_aria_label}
      data-caixa-candidatos="true"
      className="mt-2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
    >
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5">
        <p className="text-body font-medium text-fg">{mensagem}</p>
        <p className="text-caption text-fg-subtle">{m.caixa.candidatos_hint_teclado}</p>
      </div>
      <ul className="max-h-72 overflow-y-auto">
        {itens.map((produto, i) => {
          const ativo = i === ativoIndex
          const diff = diferenciador(produto)
          const semEstoque = produto.quantidade_estoque !== null && produto.quantidade_estoque < 1
          const estoqueBaixo =
            !semEstoque &&
            produto.quantidade_estoque !== null &&
            produto.estoque_minimo !== null &&
            produto.quantidade_estoque <= produto.estoque_minimo
          return (
            <li key={produto.id}>
              <button
                ref={ativo ? ativoRef : undefined}
                type="button"
                role="option"
                aria-selected={ativo}
                aria-label={m.caixa.candidatos_selecionar_aria.replace("{{nome}}", produto.nome)}
                onMouseEnter={() => onHoverIndex(i)}
                onClick={() => onSelecionar(produto)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                  ativo ? "bg-[var(--color-info-bg)]" : "hover:bg-[var(--color-surface-soft)]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-fg">{produto.nome}</span>
                  {diff ? (
                    <span className="block truncate font-mono text-caption text-fg-subtle">{diff}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-body font-semibold tabular-nums text-fg">
                    {formatBRL(produto.preco_varejo, locale)}
                  </span>
                  {semEstoque ? (
                    <span className="rounded-full border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-1.5 py-0.5 text-caption font-medium text-[var(--color-danger-strong)]">
                      {m.caixa.candidatos_badge_sem_estoque}
                    </span>
                  ) : estoqueBaixo ? (
                    <span className="rounded-full border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-1.5 py-0.5 text-caption font-medium text-[var(--color-warning-strong)]">
                      {m.caixa.candidatos_badge_estoque_baixo}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
