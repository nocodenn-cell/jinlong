"use client"

import type { ReactNode } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import { labelFormaPagamentoVenda } from "@/lib/format/vendaLabels"

export type CaixaPdvOperadorTabId = "produto" | "cliente" | "pgto"

type PagamentoLinha = {
  formaPagamento: FinalizarVendaInput["formaPagamento"]
  valor: number
}

type Props = {
  m: Mensagens
  idioma: Idioma
  tab: CaixaPdvOperadorTabId
  onTabChange: (id: CaixaPdvOperadorTabId) => void
  /** Mostra dicas de atalho (layout PDV clássico). */
  mostrarAtalhos: boolean
  operadorLabel: string
  pagamentos: PagamentoLinha[]
  totalLiquidoComGerente: number
  moedaPrefixo: string
  produtoPanel: ReactNode
}

function moneyLocale(idioma: Idioma) {
  return idioma === "pt" ? "pt-BR" : "zh-CN"
}

export function CaixaPdvOperadorTabs({
  m,
  idioma,
  tab,
  onTabChange,
  mostrarAtalhos,
  operadorLabel,
  pagamentos,
  totalLiquidoComGerente,
  moedaPrefixo,
  produtoPanel,
}: Props) {
  const loc = moneyLocale(idioma)
  const fmt = (n: number) => n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const somaParcelas = pagamentos.reduce((acc, p) => acc + p.valor, 0)

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
        className="flex shrink-0 gap-1 rounded-lg border border-border bg-muted/40 p-1"
      >
        {tabs.map((t) => {
          const selected = tab === t.id
          const title = mostrarAtalhos && t.atalho ? `${t.aria} (${t.atalho})` : t.aria
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
              className={
                selected
                  ? "flex-1 rounded-md border border-border bg-card px-2 py-2 text-center text-sm font-semibold text-foreground shadow-sm"
                  : "flex-1 rounded-md border border-transparent bg-transparent px-2 py-2 text-center text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }
              onClick={() => onTabChange(t.id)}
            >
              <span className="block leading-tight">{t.label}</span>
              {mostrarAtalhos && t.atalho ? (
                <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                  {t.atalho}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex flex-1 flex-col gap-3 overflow-hidden">
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
              ? "flex flex-1 flex-col gap-3 rounded-lg border border-border bg-card/60 p-4"
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
            tab === "pgto" ? "flex flex-1 flex-col gap-3 rounded-lg border border-border bg-card/60 p-4" : "hidden"
          }
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">{m.caixa.pdv_pgto_parcelas_titulo}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.caixa.pdv_pgto_um_meio_dinheiro}</p>
          </div>
          <ul className="space-y-2 border-t border-border pt-3">
            {pagamentos.map((p, idx) => (
              <li
                key={`${p.formaPagamento}-${idx}`}
                className="flex items-center justify-between gap-3 text-sm tabular-nums"
              >
                <span className="text-foreground">{labelFormaPagamentoVenda(p.formaPagamento, m)}</span>
                <span className="font-semibold text-foreground">
                  {moedaPrefixo} {fmt(p.valor)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{m.caixa.total_pagar}</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {moedaPrefixo} {fmt(totalLiquidoComGerente)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <dt>{m.caixa.pdv_pgto_soma_parcelas}</dt>
              <dd className="tabular-nums">
                {moedaPrefixo} {fmt(somaParcelas)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
