"use client"

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
      <div className="h-full min-h-[14rem] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <DragonIcon className="h-24 w-24 app-subtle shrink-0 opacity-40" />
        <p className="text-sm font-medium app-muted">{m.caixa.empty_guardiao}</p>
        <p className="text-xs app-subtle max-w-sm">
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
        <header className="grid grid-cols-[minmax(0,2.55fr)_4.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-2 text-xs app-muted border-b app-divider">
          <span>{m.caixa.col_produto}</span>
          <span className="text-right">{m.caixa.col_qtde}</span>
          <span className="text-right">{m.caixa.col_unit}</span>
          <span className="text-right">{m.caixa.col_total}</span>
          <span className="text-right">{m.caixa.col_tipo}</span>
        </header>
        <ul className="divide-y app-divider text-sm">
          {itens.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[minmax(0,2.55fr)_4.5rem_5rem_5.5rem_5.5rem] gap-2 px-3 py-2 items-center"
            >
              <div className="flex flex-col min-w-0 gap-1">
                <span className="font-medium truncate">{item.nome}</span>
                <MetaPdvBloco item={item} m={m} compact={false} />
                <span className="text-[11px] app-subtle font-mono truncate">
                  {m.caixa.id_label}: {item.produtoId.slice(0, 8)}…
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
                  className="w-16 h-8 text-right text-xs px-1 app-input"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-1 text-[11px] app-subtle hover:app-accent-text"
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
      <ul className="md:hidden divide-y app-divider">
        {itens.map((item) => (
          <li key={item.id} className="p-3 space-y-2">
            <div className="flex justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-medium text-sm truncate">{item.nome}</div>
                <MetaPdvBloco item={item} m={m} compact />
                <div className="text-[10px] app-subtle font-mono truncate">
                  {m.caixa.id_label}: {item.produtoId.slice(0, 8)}…
                </div>
              </div>
              <TipoPrecoBadge m={m} tipo={item.resultado.tipoPreco} compact />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="app-subtle">{m.caixa.col_qtde}</span>
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
                    className="h-9 text-right app-input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="app-accent-text hover:opacity-85 shrink-0"
                    onClick={() => onRemover(item.id)}
                  >
                    {m.caixa.remover}
                  </Button>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div>
                  <span className="app-subtle block">{m.caixa.col_unit}</span>
                  <span className="tabular-nums">
                    {moeda} {formatDecimal2(item.resultado.precoOriginal, locale)}
                  </span>
                </div>
                <div>
                  <span className="app-subtle block">{m.caixa.col_total}</span>
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

  const origemClass =
    meta.origem === "china_manual"
      ? "app-badge-warn"
      : meta.origem === "brasil_nf"
        ? "app-badge-positive"
        : "app-border app-muted app-surface-soft"

  const nfClass = meta.tem_nf
    ? "app-badge-positive"
    : "app-border app-muted"

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
        <p className={`text-[11px] app-muted ${compact ? "line-clamp-2" : "line-clamp-2"}`}>
          <span className="app-subtle">{m.caixa.obs_titulo}</span> {obs}
        </p>
      ) : null}
      {estoqueFmt ? (
        <p
          className={`text-[11px] tabular-nums ${
            alertaCritico || alertaMinimo ? "app-accent-text" : "app-subtle"
          }`}
        >
          {estoqueFmt}
          {alertaMinimo || alertaCritico ? (
            <>
              {" "}
              <span className="app-accent-text">· {m.caixa.alerta_estoque_min}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {alertaMinimo || alertaCritico ? (
        <p className="text-[10px] app-accent-text leading-snug">{m.caixa.alerta_rep_import}</p>
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
      ? "app-badge-positive"
      : tipo === "MANUAL"
        ? "app-badge-warn"
        : tipo === "PROMOCAO"
          ? "app-badge-info"
          : "app-border app-muted app-surface-soft"
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
