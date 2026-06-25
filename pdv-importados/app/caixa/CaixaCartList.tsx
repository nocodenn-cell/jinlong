"use client"

import React, { memo } from "react"
import { Minus, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ItemCarrinhoComPreco } from "@/stores/carrinhoStore"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { formatDecimal2 } from "@/lib/format/money"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { DragonIcon } from "@/components/icons/DragonIcon"
import { labelOrigemCaixa } from "@/lib/caixa/metaProdutoUi"
import type { OrigemProdutoCaixa } from "@/app/caixa/caixaActionTypes"

/** Chip “positivo” no caixa (atacado, NF, origem BR com NF) — alinhado aos tokens `success`. */
const CAIXA_CHIP_SUCCESS = 'border-success/40 bg-success/15 text-success'

export type CaixaCartListEmptyVariant = "default" | "pdv_classic"

type Props = {
  m: Mensagens
  idioma: Idioma
  itens: ItemCarrinhoComPreco[]
  moeda: string
  /** Empty state alinhado ao mockup PDV clássico (sem o guardião). */
  listEmptyVariant?: CaixaCartListEmptyVariant
  onAlterarQuantidade: (itemId: string, quantidade: number) => void
  onRemover: (itemId: string) => void
}

function listLocale(idioma: Idioma) {
  if (idioma === "pt") return "pt-BR"
  if (idioma === "zh") return "zh-CN"
  return "zh-CN"
}

function parseQuantidadeInput(raw: string): number {
  const normalizado = raw.replace(",", ".").trim()
  const valor = Number(normalizado)
  if (!Number.isFinite(valor) || valor <= 0) return 0
  return Math.max(1, Math.round(valor))
}

function resultadoLinha(item: ItemCarrinhoComPreco) {
  const r = item.resultado
  const precoUnitario = r?.precoUnitario ?? item.precoUnitario ?? item.precoOriginal ?? 0
  const precoOriginal = r?.precoOriginal ?? item.precoOriginal ?? precoUnitario
  const tipoPreco = r?.tipoPreco ?? "VAREJO"
  return { precoUnitario, precoOriginal, tipoPreco }
}

type StepperSize = "sm" | "md"

type StepperProps = {
  m: Mensagens
  item: ItemCarrinhoComPreco
  size: StepperSize
  onAlterarQuantidade: (itemId: string, quantidade: number) => void
  onRemover: (itemId: string) => void
}

const QuantidadeStepper = memo(function QuantidadeStepper({
  m,
  item,
  size,
  onAlterarQuantidade,
  onRemover,
}: StepperProps) {
  const isCompact = size === "sm"
  const buttonSizeClass = isCompact ? "h-8 w-8" : "h-9 w-9"
  const inputSizeClass = isCompact ? "h-8 w-12" : "h-9 w-14"
  const iconClass = isCompact ? "h-3.5 w-3.5" : "h-4 w-4"

  const handleDecrement = () => {
    if (item.quantidade <= 1) {
      onRemover(item.id)
      return
    }
    onAlterarQuantidade(item.id, item.quantidade - 1)
  }

  const handleIncrement = () => {
    onAlterarQuantidade(item.id, item.quantidade + 1)
  }

  return (
    <div
      className="inline-flex items-center rounded-md border border-border bg-background overflow-hidden"
      role="group"
      aria-label={caixaFmt(m.caixa.aria_qtde_item, { nome: item.nome })}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${buttonSizeClass} rounded-none border-r border-border text-foreground hover:bg-muted hover:text-primary`}
        aria-label={caixaFmt(m.caixa.aria_qtde_diminuir, { nome: item.nome })}
        onClick={handleDecrement}
      >
        <Minus className={iconClass} aria-hidden="true" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={item.quantidade}
        aria-label={caixaFmt(m.caixa.aria_qtde_item, { nome: item.nome })}
        onChange={(e) =>
          onAlterarQuantidade(item.id, parseQuantidadeInput(e.target.value))
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.currentTarget as HTMLInputElement).blur()
            const busca = document.querySelector<HTMLElement>('[data-caixa-busca="true"]')
            busca?.focus()
          }
        }}
        className={`${inputSizeClass} rounded-none border-0 text-center text-sm tabular-nums px-1 bg-background focus-visible:ring-1 focus-visible:ring-primary/40`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`${buttonSizeClass} rounded-none border-l border-border text-foreground hover:bg-muted hover:text-primary`}
        aria-label={caixaFmt(m.caixa.aria_qtde_aumentar, { nome: item.nome })}
        onClick={handleIncrement}
      >
        <Plus className={iconClass} aria-hidden="true" />
      </Button>
    </div>
  )
})

type CartRowProps = {
  m: Mensagens
  item: ItemCarrinhoComPreco
  moeda: string
  locale: string
  onAlterarQuantidade: (itemId: string, quantidade: number) => void
  onRemover: (itemId: string) => void
}

const CartRowDesktop = memo(function CartRowDesktop({
  m,
  item,
  moeda,
  locale,
  onAlterarQuantidade,
  onRemover,
}: CartRowProps) {
  const res = resultadoLinha(item)
  return (
    <li
      className="grid grid-cols-[minmax(0,2.55fr)_8.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-3 items-center hover:bg-accent/50 transition-colors"
    >
      <div className="flex flex-col min-w-0 gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate text-base text-foreground">{item.nome}</span>
          {res.tipoPreco === "ATACADO" ? (
            <Badge
              variant="outline"
              className={`shrink-0 px-1.5 py-0 text-[10px] font-semibold ${CAIXA_CHIP_SUCCESS}`}
            >
              {m.relatorios.atacado}
            </Badge>
          ) : null}
        </div>
        <MetaPdvBloco item={item} m={m} compact={false} />
        <span className="text-xs text-foreground/70 font-mono truncate opacity-90">
          {m.caixa.id_label}: {item.produtoId.slice(0, 8)}…
        </span>
      </div>
      <div className="flex items-center justify-end gap-1">
        <QuantidadeStepper
          m={m}
          item={item}
          size="sm"
          onAlterarQuantidade={onAlterarQuantidade}
          onRemover={onRemover}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-1 text-[11px] text-muted-foreground hover:text-primary"
          onClick={() => onRemover(item.id)}
        >
          {m.caixa.remover}
        </Button>
      </div>
      <div className="text-right tabular-nums text-sm">
        {res.tipoPreco === "ATACADO" && res.precoOriginal > res.precoUnitario ? (
          <div className="space-y-0.5">
            <div className="line-through text-foreground/55 text-xs">
              {moeda} {formatDecimal2(res.precoOriginal, locale)}
            </div>
            <div>
              {moeda} {formatDecimal2(res.precoUnitario, locale)}
            </div>
          </div>
        ) : (
          <span>
            {moeda} {formatDecimal2(res.precoUnitario, locale)}
          </span>
        )}
      </div>
      <div className="text-right tabular-nums text-sm">
        <div>
          {moeda}{" "}
          {formatDecimal2(res.precoUnitario * item.quantidade, locale)}
        </div>
        {res.tipoPreco === "ATACADO" && res.precoOriginal > res.precoUnitario ? (
          <div className="text-success text-[10px]">
            ↓ {moeda}{" "}
            {formatDecimal2((res.precoOriginal - res.precoUnitario) * item.quantidade, locale)}
          </div>
        ) : null}
      </div>
      <TipoPrecoBadge m={m} tipo={res.tipoPreco} />
    </li>
  )
})

const CartCardMobile = memo(function CartCardMobile({
  m,
  item,
  moeda,
  locale,
  onAlterarQuantidade,
  onRemover,
}: CartRowProps) {
  const res = resultadoLinha(item)
  return (
    <li className="p-4 space-y-3 hover:bg-accent/50 transition-colors">
      <div className="flex justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="font-semibold text-base truncate text-foreground">{item.nome}</div>
            {res.tipoPreco === "ATACADO" ? (
              <Badge
                variant="outline"
                className={`shrink-0 px-1.5 py-0 text-[10px] font-semibold ${CAIXA_CHIP_SUCCESS}`}
              >
                {m.relatorios.atacado}
              </Badge>
            ) : null}
          </div>
          <MetaPdvBloco item={item} m={m} compact />
          <div className="text-[9px] text-muted-foreground font-mono truncate opacity-60">
            {m.caixa.id_label}: {item.produtoId.slice(0, 8)}…
          </div>
        </div>
        <TipoPrecoBadge m={m} tipo={res.tipoPreco} compact />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-foreground/85">{m.caixa.col_qtde}</span>
          <div className="flex items-center gap-2 mt-0.5">
            <QuantidadeStepper
              m={m}
              item={item}
              size="md"
              onAlterarQuantidade={onAlterarQuantidade}
              onRemover={onRemover}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary text-sm font-semibold hover:opacity-85 shrink-0"
              onClick={() => onRemover(item.id)}
            >
              {m.caixa.remover}
            </Button>
          </div>
        </div>
        <div className="text-right space-y-1">
          <div>
            <span className="text-foreground/85 block">{m.caixa.col_unit}</span>
            <span className="tabular-nums">
              {res.tipoPreco === "ATACADO" && res.precoOriginal > res.precoUnitario ? (
                <span className="block space-y-0.5">
                  <span className="line-through text-foreground/55 text-[10px] block">
                    {moeda} {formatDecimal2(res.precoOriginal, locale)}
                  </span>
                  <span>
                    {moeda} {formatDecimal2(res.precoUnitario, locale)}
                  </span>
                </span>
              ) : (
                <span>
                  {moeda} {formatDecimal2(res.precoUnitario, locale)}
                </span>
              )}
            </span>
          </div>
          <div>
            <span className="text-foreground/85 block">{m.caixa.col_total}</span>
            <span className="tabular-nums font-medium">
              {moeda}{" "}
              {formatDecimal2(res.precoUnitario * item.quantidade, locale)}
            </span>
            {res.tipoPreco === "ATACADO" && res.precoOriginal > res.precoUnitario ? (
              <span className="text-success text-[10px] block">
                ↓ {moeda}{" "}
                {formatDecimal2((res.precoOriginal - res.precoUnitario) * item.quantidade, locale)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  )
})

function CaixaCartListInner({
  m,
  idioma,
  itens,
  moeda,
  listEmptyVariant = "default",
  onAlterarQuantidade,
  onRemover,
}: Props) {
  const locale = listLocale(idioma)

  if (itens.length === 0) {
    if (listEmptyVariant === "pdv_classic") {
      return (
        <div className="flex h-full min-h-[10rem] flex-col justify-between px-4 py-3">
          {/* Mensagem discreta — sem ícone grande */}
          <p className="text-sm text-jl-fg-2">
            {m.caixa.cart_empty_sem_pedido} · {m.caixa.empty_cta_scan}
          </p>
          {/* Atalhos de teclado: rodapé, linha única, opacidade reduzida */}
          <div className="flex flex-wrap items-center gap-1.5 opacity-60">
            <span className="inline-flex shrink-0 rounded border border-jl-border-1 bg-jl-surface-soft px-1.5 py-0.5 text-[10px] leading-tight text-jl-fg-2">
              Enter · {m.caixa.adicionar_enter}
            </span>
            <span className="inline-flex shrink-0 rounded border border-jl-border-1 bg-jl-surface-soft px-1.5 py-0.5 text-[10px] leading-tight text-jl-fg-2">
              Ctrl+B · {m.caixa.empty_shortcut_focus}
            </span>
            <span className="inline-flex shrink-0 rounded border border-jl-border-1 bg-jl-surface-soft px-1.5 py-0.5 text-[10px] leading-tight text-jl-fg-2">
              F4 · {m.caixa.finalizar_venda}
            </span>
          </div>
        </div>
      )
    }
    return (
      <div className="h-full min-h-[14rem] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <DragonIcon className="h-24 w-24 app-subtle shrink-0 opacity-40" />
        <p className="text-base font-semibold text-foreground/90">{m.caixa.empty_guardiao}</p>
        <div className="max-w-md space-y-2">
          <p className="text-sm font-semibold text-foreground/95">{m.caixa.empty_cta_scan}</p>
          <p className="text-sm text-foreground/85">{m.caixa.empty_cta_type_enter}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-1 opacity-60">
            <span className="rounded-full border border-jl-border-1 bg-jl-surface-soft px-2.5 py-1 text-xs text-jl-fg-2">
              Enter · {m.caixa.adicionar_enter}
            </span>
            <span className="rounded-full border border-jl-border-1 bg-jl-surface-soft px-2.5 py-1 text-xs text-jl-fg-2">
              Ctrl+B · {m.caixa.empty_shortcut_focus}
            </span>
            <span className="rounded-full border border-jl-border-1 bg-jl-surface-soft px-2.5 py-1 text-xs text-jl-fg-2">
              F4 · {m.caixa.finalizar_venda}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Desktop: tabela */}
      <div className="hidden md:block">
        <header className="grid grid-cols-[minmax(0,2.55fr)_8.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-2 text-sm text-foreground/85 border-b border-border">
          <span>{m.caixa.col_produto}</span>
          <span className="text-right">{m.caixa.col_qtde}</span>
          <span className="text-right">{m.caixa.col_unit}</span>
          <span className="text-right">{m.caixa.col_total}</span>
          <span className="text-right">{m.caixa.col_tipo}</span>
        </header>
        <ul className="divide-y border-border text-sm">
          {itens.map((item) => (
            <CartRowDesktop
              key={item.id}
              m={m}
              item={item}
              moeda={moeda}
              locale={locale}
              onAlterarQuantidade={onAlterarQuantidade}
              onRemover={onRemover}
            />
          ))}
        </ul>
      </div>

      {/* Mobile: cards */}
      <ul className="md:hidden divide-y border-border">
        {itens.map((item) => (
          <CartCardMobile
            key={item.id}
            m={m}
            item={item}
            moeda={moeda}
            locale={locale}
            onAlterarQuantidade={onAlterarQuantidade}
            onRemover={onRemover}
          />
        ))}
      </ul>
    </>
  )
}

export const CaixaCartList = memo(CaixaCartListInner)

function MetaPdvBloco({
  item,
  m,
  compact,
}: {
  item: ItemCarrinhoComPreco
  m: Mensagens
  compact: boolean
}) {
  const meta = item.metaPdv
  if (!meta) return null

  const origemRaw = meta.origem
  const origem: OrigemProdutoCaixa =
    origemRaw === "china_manual" || origemRaw === "brasil_nf" || origemRaw === "brasil_sem_nf"
      ? origemRaw
      : "brasil_nf"

  const origemClass =
    origem === "china_manual"
      ? "bg-yellow-900/30 text-yellow-400 border border-yellow-700"
      : CAIXA_CHIP_SUCCESS

  return (
    <div className="space-y-1">
      <div className={`flex flex-wrap items-center gap-1 ${compact ? "" : "max-w-full"}`}>
        <Badge variant="outline" className={`text-xs font-medium px-1.5 py-0 ${origemClass}`}>
          {labelOrigemCaixa(origem, m)}
        </Badge>
      </div>
    </div>
  )
}

function TipoPrecoBadge({
  m,
  tipo,
  compact,
}: {
  m: Mensagens
  tipo: "VAREJO" | "ATACADO" | "MANUAL" | "PROMOCAO"
  compact?: boolean
}) {
  const label =
    tipo === "ATACADO"
      ? m.relatorios.atacado
      : tipo === "MANUAL"
        ? m.relatorios.manual
        : tipo === "PROMOCAO"
          ? m.relatorios.promocao
          : m.relatorios.varejo
  const className =
    tipo === 'ATACADO'
      ? CAIXA_CHIP_SUCCESS
      : tipo === "MANUAL"
        ? "bg-yellow-900/30 text-yellow-400 border border-yellow-700"
        : tipo === "PROMOCAO"
          ? "bg-blue-900/30 text-blue-400 border border-blue-700"
          : "border border-border text-muted-foreground bg-muted"
  const badge = (
    <Badge
      variant="outline"
      className={`${className} text-xs font-semibold shrink-0`}
    >
      {label}
    </Badge>
  )
  if (compact) return badge
  return <div className="text-right flex justify-end">{badge}</div>
}
