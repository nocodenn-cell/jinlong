"use client"

import { useEffect, useState } from "react"
import { obterCotacaoUsdBrl } from "@/app/caixa/actions"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"

type Props = {
  m: Mensagens
  idioma: Idioma
}

function listLocale(idioma: Idioma) {
  if (idioma === "pt") return "pt-BR"
  if (idioma === "zh-HK") return "zh-HK"
  return "zh-CN"
}

export function CaixaOperadorContextBar({ m, idioma }: Props) {
  const locale = listLocale(idioma)
  const [cotacao, setCotacao] = useState<
    | { brl: number; data: string; fonte: "api" | "fallback" }
    | "erro"
    | "carregando"
  >("carregando")

  useEffect(() => {
    let cancel = false
    void (async () => {
      const res = await obterCotacaoUsdBrl()
      if (cancel) return
      if (!res.ok) {
        setCotacao("erro")
        return
      }
      setCotacao({
        brl: res.brlPorUsd,
        data: res.dataReferencia,
        fonte: res.fonte,
      })
    })()
    return () => {
      cancel = true
    }
  }, [])

  const cambioTexto =
    cotacao === "carregando"
      ? m.caixa.cambio_carregando
      : cotacao === "erro"
        ? m.caixa.cambio_usd_indisponivel
        : cotacao.fonte === "fallback"
          ? caixaFmt(m.caixa.cambio_usd_fallback, {
              valor: cotacao.brl.toLocaleString(locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              }),
              data: cotacao.data,
            })
          : caixaFmt(m.caixa.cambio_usd, {
              valor: cotacao.brl.toLocaleString(locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              }),
              data: cotacao.data,
            })

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 rounded-lg border border-border px-3 py-2 text-[11px] sm:text-xs bg-muted/50 text-muted-foreground">
      <div className="flex items-start gap-2 min-w-0">
        <span
          className="shrink-0 mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-primary"
          aria-hidden
        />
        <p className="leading-snug min-w-0">
          <span className="font-medium tabular-nums">{cambioTexto}</span>
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span>{m.caixa.leadtime_banner}</span>
        </p>
      </div>
    </div>
  )
}
