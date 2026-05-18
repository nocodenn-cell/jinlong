"use client"

import type { ReactNode } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { CaixaPdvLayoutVariant } from "@/app/caixa/CaixaPdvTopBar"

export type CaixaPdvOperadorTabId = "produto" | "cliente" | "pgto"

type Props = {
  m: Mensagens
  idioma: Idioma
  tab: CaixaPdvOperadorTabId
  onTabChange: (id: CaixaPdvOperadorTabId) => void
  layoutVariant?: CaixaPdvLayoutVariant
  mostrarAtalhos: boolean
  operadorLabel: string
  totalLiquidoComGerente: number
  produtoPanel: ReactNode
  /** Painel de pagamento (split) renderizado na aba Pgto. */
  metodoPagamentoPanel?: ReactNode
}

function moneyLocale(idioma: Idioma) {
  return idioma === "pt" ? "pt-BR" : "zh-CN"
}

export function CaixaPdvOperadorTabs({
  m,
  idioma,
  tab,
  onTabChange,
  layoutVariant = "default",
  mostrarAtalhos,
  operadorLabel,
  totalLiquidoComGerente,
  produtoPanel,
  metodoPagamentoPanel,
}: Props) {
  const classicChrome = layoutVariant === "classic"
  const loc = moneyLocale(idioma)
  const fmt = (n: number) => n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const tabs: { id: CaixaPdvOperadorTabId; label: string; aria: string; atalho?: string }[] = [
    { id: "produto", label: m.caixa.pdv_tab_produto, aria: m.caixa.pdv_tab_aria_produto, atalho: "Alt+Z" },
    { id: "cliente", label: m.caixa.pdv_tab_cliente, aria: m.caixa.pdv_tab_aria_cliente, atalho: "Alt+C" },
    { id: "pgto", label: m.caixa.pdv_tab_pgto, aria: m.caixa.pdv_tab_aria_pgto, atalho: "Alt+B" },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        role="tablist"
        aria-label={m.caixa.pdv_tabs_lista_aria}
        className={
          classicChrome
            ? "flex shrink-0 gap-1 border-b border-border/80 bg-muted/25 px-0.5 pt-1"
            : "flex shrink-0 gap-1 rounded-lg border border-border bg-muted/40 p-1"
        }
      >
        {tabs.map((t) => {
          const selected = tab === t.id
          const title = mostrarAtalhos && t.atalho ? `${t.aria} (${t.atalho})` : t.aria
          const tabButtonClass = classicChrome
            ? selected
              ? "relative z-[1] -mb-px flex-1 rounded-t-md border-x-0 border-b-2 border-b-background border-t-2 border-t-primary bg-background px-2 py-2 text-center text-sm font-semibold text-foreground shadow-[0_-1px_6px_rgba(0,0,0,0.05)]"
              : "flex-1 rounded-t-md border border-transparent bg-muted/60 px-2 py-2 text-center text-sm font-medium text-foreground/80 ring-1 ring-border/70 hover:bg-muted/90 hover:text-foreground"
            : selected
              ? "flex-1 rounded-md border border-border bg-card px-2 py-2 text-center text-sm font-semibold text-foreground shadow-sm"
              : "flex-1 rounded-md border border-transparent bg-transparent px-2 py-2 text-center text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          const atalhoClass = classicChrome
            ? selected
              ? "mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-foreground/70"
              : "mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-foreground/55"
            : "mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-muted-foreground"
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`caixa-pdv-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`caixa-pdv-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              title={title}
              className={tabButtonClass}
              onClick={() => onTabChange(t.id)}
            >
              <span className="block leading-tight">{t.label}</span>
              {mostrarAtalhos && t.atalho ? <span className={atalhoClass}>{t.atalho}</span> : null}
            </button>
          )
        })}
      </div>

      <div
        className={
          classicChrome
            ? "min-h-0 flex flex-1 flex-col gap-2 overflow-hidden"
            : "min-h-0 flex flex-1 flex-col gap-3 overflow-hidden"
        }
      >
        <div
          role="tabpanel"
          id="caixa-pdv-panel-produto"
          aria-labelledby="caixa-pdv-tab-produto"
          hidden={tab !== "produto"}
          className={tab === "produto" ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden" : "hidden"}
        >
          {produtoPanel}
        </div>

        <div
          role="tabpanel"
          id="caixa-pdv-panel-cliente"
          aria-labelledby="caixa-pdv-tab-cliente"
          hidden={tab !== "cliente"}
          className={
            tab === "cliente"
              ? classicChrome
                ? "flex flex-1 flex-col gap-3 rounded-lg border-x border-b border-border/60 border-t-2 border-t-primary bg-card/60 p-4 shadow-sm"
                : "flex flex-1 flex-col gap-3 rounded-lg border border-border bg-card/60 p-4"
              : "hidden"
          }
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">{m.caixa.pdv_cliente_cupom_titulo}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.caixa.pdv_cliente_sem_cadastro_desc}</p>
          </div>
          <dl className="space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{m.caixa.pdv_cliente_operador_label}</dt>
              <dd className="max-w-[65%] text-right font-medium text-foreground break-words">{operadorLabel}</dd>
            </div>
          </dl>
        </div>

        <div
          role="tabpanel"
          id="caixa-pdv-panel-pgto"
          aria-labelledby="caixa-pdv-tab-pgto"
          hidden={tab !== "pgto"}
          className={
            tab === "pgto"
              ? classicChrome
                ? "flex flex-1 flex-col gap-3 rounded-lg border-x border-b border-border/60 border-t-2 border-t-primary bg-card/60 p-4 shadow-sm overflow-y-auto"
                : "flex flex-1 flex-col gap-3 rounded-lg border border-border bg-card/60 p-4 overflow-y-auto"
              : "hidden"
          }
        >
          {metodoPagamentoPanel ?? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{m.caixa.total_pagar}</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {fmt(totalLiquidoComGerente)}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </div>
  )
}
