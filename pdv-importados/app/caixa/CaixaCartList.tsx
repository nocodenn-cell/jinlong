"use client"

import React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ItemCarrinhoComPreco } from "@/stores/carrinhoStore"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { formatDecimal2 } from "@/lib/format/money"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { DragonIcon } from "@/components/icons/DragonIcon"
import { labelOrigemCaixa, truncarObservacaoCaixa } from "@/lib/caixa/metaProdutoUi"

type Props = {
  m: Mensagens
  idioma: Idioma
  itens: ItemCarrinhoComPreco[]
  moeda: string
  onAlterarQuantidade: (itemId: string, quantidade: number) => void
  onRemover: (itemId: string) => void
}

function listLocale(idioma: Idioma) {
  if (idioma === "pt") return "pt-BR"
  if (idioma === "zh") return "zh-CN"
  return "zh-CN"
}

export function CaixaCartList({
  m,
  idioma,
  itens,
  moeda,
  onAlterarQuantidade,
  onRemover,
}: Props) {
  const locale = listLocale(idioma)

  if (itens.length === 0) {
    return (
      <div className="h-full min-h-[14rem] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <DragonIcon className="h-24 w-24 app-subtle shrink-0 opacity-40" />
        <p className="text-sm font-medium text-muted-foreground">{m.caixa.empty_guardiao}</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          {m.caixa.carrinho_vazio_linha1}{" "}
          <span className="mx-1 font-mono app-subtle">{m.caixa.carrinho_vazio_ref_catalogo}</span>{" "}
          {m.caixa.carrinho_vazio_linha2}
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Desktop: tabela */}
      <div className="hidden md:block">
        <header className="grid grid-cols-[minmax(0,2.55fr)_4.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-2 text-xs text-muted-foreground border-b border-border">
          <span>{m.caixa.col_produto}</span>
          <span className="text-right">{m.caixa.col_qtde}</span>
          <span className="text-right">{m.caixa.col_unit}</span>
          <span className="text-right">{m.caixa.col_total}</span>
          <span className="text-right">{m.caixa.col_tipo}</span>
        </header>
        <ul className="divide-y border-border text-sm">
          {itens.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[minmax(0,2.55fr)_4.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-3 items-center hover:bg-accent/50 transition-colors"
            >
              <div className="flex flex-col min-w-0 gap-1">
                <span className="font-semibold truncate text-base text-foreground">{item.nome}</span>
                <MetaPdvBloco item={item} m={m} compact={false} />
                <span className="text-[10px] text-muted-foreground font-mono truncate opacity-60">
                  {m.caixa.id_label}: {item.produtoId.slice(0, 8)}…
                </span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <div className="relative">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.001}
                    step={0.001}
                    value={item.quantidade}
                    aria-label={caixaFmt(m.caixa.aria_qtde_item, { nome: item.nome })}
                    onChange={(e) =>
                      onAlterarQuantidade(item.id, Number(e.target.value))
                    }
                    className="w-16 h-8 text-right text-xs px-1 bg-background border border-border text-foreground pr-8"
                  />
                  <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full font-medium">
                      {item.quantidade}
                    </Badge>
                  </div>
                </div>
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
                {moeda} {formatDecimal2(item.resultado.precoOriginal, locale)}
              </div>
              <div className="text-right tabular-nums text-sm">
                {moeda}{" "}
                {formatDecimal2(item.resultado.precoUnitario * item.quantidade, locale)}
              </div>
              <TipoPrecoBadge m={m} tipo={item.resultado.tipoPreco} />
            </li>
          ))}
        </ul>
      </div>

      {/* Mobile: cards */}
      <ul className="md:hidden divide-y border-border">
        {itens.map((item) => (
          <li key={item.id} className="p-4 space-y-3 hover:bg-accent/50 transition-colors">
            <div className="flex justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-semibold text-base truncate text-foreground">{item.nome}</div>
                <MetaPdvBloco item={item} m={m} compact />
                <div className="text-[9px] text-muted-foreground font-mono truncate opacity-60">
                  {m.caixa.id_label}: {item.produtoId.slice(0, 8)}…
                </div>
              </div>
              <TipoPrecoBadge m={m} tipo={item.resultado.tipoPreco} compact />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">{m.caixa.col_qtde}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="relative flex-1">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0.001}
                      step={0.001}
                      value={item.quantidade}
                      aria-label={caixaFmt(m.caixa.aria_qtde_item, { nome: item.nome })}
                      onChange={(e) =>
                        onAlterarQuantidade(item.id, Number(e.target.value))
                      }
                      className="h-9 text-right bg-background border border-border text-foreground pr-12"
                    />
                    <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
                      <Badge variant="secondary" className="bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full font-medium">
                        {item.quantidade}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:opacity-85 shrink-0"
                    onClick={() => onRemover(item.id)}
                  >
                    {m.caixa.remover}
                  </Button>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div>
                  <span className="text-muted-foreground block">{m.caixa.col_unit}</span>
                  <span className="tabular-nums">
                    {moeda} {formatDecimal2(item.resultado.precoOriginal, locale)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">{m.caixa.col_total}</span>
                  <span className="tabular-nums font-medium">
                    {moeda}{" "}
                    {formatDecimal2(
                      item.resultado.precoUnitario * item.quantidade,
                      locale,
                    )}
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

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

  const getOrigemClass = (origem: string) => {
    if (origem === "china_manual") return "bg-yellow-900/30 text-yellow-400 border border-yellow-700"
    if (origem === "brasil_nf") return "bg-green-900/30 text-green-400 border border-green-700"
    return "border border-border text-muted-foreground bg-muted"
  }

  const origemClass = getOrigemClass(meta.origem)

  const nfClass = meta.tem_nf
    ? "bg-green-900/30 text-green-400 border border-green-700"
    : "border border-border text-muted-foreground"

  const q = meta.estoque_atual
  const min = meta.estoque_minimo
  const alertaCritico = q !== null && q < 1
  const alertaMinimo =
    !alertaCritico && q !== null && min !== null && q <= min

  const obs = truncarObservacaoCaixa(meta.observacao)
  const estoqueFmt =
    q !== null && min !== null
      ? caixaFmt(m.caixa.estoque_resumo, {
          atual: String(q),
          min: String(min),
        })
      : q !== null
        ? caixaFmt(m.caixa.estoque_resumo_sem_min, { atual: String(q) })
        : null

  return (
    <div className={compact ? "space-y-1" : "space-y-1"}>
      <div className={`flex flex-wrap items-center gap-1 ${compact ? "" : "max-w-full"}`}>
        <Badge variant="outline" className={`text-[9px] font-medium px-1.5 py-0 ${origemClass}`}>
          {labelOrigemCaixa(meta.origem, m)}
        </Badge>
        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${nfClass}`}>
          {meta.tem_nf ? m.caixa.badge_nf : m.caixa.badge_sem_nf}
        </Badge>
      </div>
      {obs ? (
        <p className={`text-[11px] text-muted-foreground ${compact ? "line-clamp-2" : "line-clamp-2"}`}>
          <span className="text-muted-foreground">{m.caixa.obs_titulo}</span> {obs}
        </p>
      ) : null}
      {estoqueFmt ? (
        <p
          className={`text-[11px] tabular-nums ${
            alertaCritico || alertaMinimo ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {estoqueFmt}
          {alertaMinimo || alertaCritico ? (
            <>
              {" "}
              <span className="text-primary">· {m.caixa.alerta_estoque_min}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {alertaMinimo || alertaCritico ? (
        <p className="text-[10px] text-primary leading-snug">{m.caixa.alerta_rep_import}</p>
      ) : null}
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
          ? "PROMO"
          : m.relatorios.varejo
  const className =
    tipo === "ATACADO"
      ? "bg-green-900/30 text-green-400 border border-green-700"
      : tipo === "MANUAL"
        ? "bg-yellow-900/30 text-yellow-400 border border-yellow-700"
        : tipo === "PROMOCAO"
          ? "bg-blue-900/30 text-blue-400 border border-blue-700"
          : "border border-border text-muted-foreground bg-muted"
  const badge = (
    <Badge
      variant="outline"
      className={`${className} text-[10px] font-semibold shrink-0`}
    >
      {label}
    </Badge>
  )
  if (compact) return badge
  return <div className="text-right flex justify-end">{badge}</div>
}
