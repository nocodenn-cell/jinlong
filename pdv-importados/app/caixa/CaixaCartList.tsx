"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ItemCarrinhoComPreco } from "@/stores/carrinhoStore"
import type { Mensagens } from "@/src/lib/i18n/getMessages"
import type { Idioma } from "@/src/lib/idioma/normalizeIdioma"
import { formatDecimal2 } from "@/lib/format/money"
import { caixaFmt } from "@/app/caixa/caixaI18n"

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
  if (idioma === "zh-HK") return "zh-HK"
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
      <div className="h-full min-h-[12rem] flex items-center justify-center text-sm text-slate-500 px-4 text-center">
        {m.caixa.carrinho_vazio_linha1}{" "}
        <span className="mx-1 font-mono text-slate-400">{m.caixa.carrinho_vazio_ref_catalogo}</span>{" "}
        {m.caixa.carrinho_vazio_linha2}
      </div>
    )
  }

  return (
    <>
      {/* Desktop: tabela */}
      <div className="hidden md:block">
        <header className="grid grid-cols-[minmax(0,2.2fr)_4.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-2 text-xs text-slate-400 border-b border-slate-800">
          <span>{m.caixa.col_produto}</span>
          <span className="text-right">{m.caixa.col_qtde}</span>
          <span className="text-right">{m.caixa.col_unit}</span>
          <span className="text-right">{m.caixa.col_total}</span>
          <span className="text-right">{m.caixa.col_tipo}</span>
        </header>
        <ul className="divide-y divide-slate-800 text-sm">
          {itens.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[minmax(0,2.2fr)_4.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-2 items-center"
            >
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{item.nome}</span>
                <span className="text-xs text-slate-500 truncate">
                  {m.caixa.id_label}: {item.produtoId}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1">
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
                  className="w-16 h-8 text-right bg-slate-800 border-slate-600 text-slate-100 text-xs px-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-1 text-[11px] text-slate-500 hover:text-red-400"
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
      <ul className="md:hidden divide-y divide-slate-800">
        {itens.map((item) => (
          <li key={item.id} className="p-3 space-y-2">
            <div className="flex justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{item.nome}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {m.caixa.id_label}: {item.produtoId}
                </div>
              </div>
              <TipoPrecoBadge m={m} tipo={item.resultado.tipoPreco} compact />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">{m.caixa.col_qtde}</span>
                <div className="flex items-center gap-2 mt-0.5">
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
                    className="h-9 text-right bg-slate-800 border-slate-600 text-slate-100"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 shrink-0"
                    onClick={() => onRemover(item.id)}
                  >
                    {m.caixa.remover}
                  </Button>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div>
                  <span className="text-slate-500 block">{m.caixa.col_unit}</span>
                  <span className="tabular-nums">
                    {moeda} {formatDecimal2(item.resultado.precoOriginal, locale)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">{m.caixa.col_total}</span>
                  <span className="tabular-nums font-medium text-slate-100">
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

function TipoPrecoBadge({
  m,
  tipo,
  compact,
}: {
  m: Mensagens
  tipo: "VAREJO" | "ATACADO" | "MANUAL"
  compact?: boolean
}) {
  const label =
    tipo === "ATACADO"
      ? m.relatorios.atacado
      : tipo === "MANUAL"
        ? m.relatorios.manual
        : m.relatorios.varejo
  const className =
    tipo === "ATACADO"
      ? "bg-emerald-600/15 border-emerald-500/40 text-emerald-300"
      : tipo === "MANUAL"
        ? "bg-amber-600/20 border-amber-500/50 text-amber-200"
        : "bg-slate-700/40 border-slate-500/40 text-slate-200"
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
