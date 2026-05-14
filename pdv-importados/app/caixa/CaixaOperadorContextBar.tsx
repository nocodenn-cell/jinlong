"use client"

import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { parseIntegerConfig } from "@/lib/caixa/configuracoesGeraisCaixa"

type Props = Readonly<{
  m: Mensagens
  idioma: Idioma
  configCaixaWeb: Record<string, string>
}>

export function CaixaOperadorContextBar({ m, idioma, configCaixaWeb }: Props) {
  void idioma
  const leadMin = parseIntegerConfig(configCaixaWeb.lead_time_min_dias, 30)
  const leadMax = parseIntegerConfig(configCaixaWeb.lead_time_max_dias, 60)
  if (!Number.isFinite(leadMin) || !Number.isFinite(leadMax) || leadMin <= 0 || leadMax <= 0) {
    return null
  }
  return (
    <div className="text-xs text-muted-foreground">
      {caixaFmt(m.caixa.lead_time_importacao_banner, { min: leadMin, max: leadMax })}
    </div>
  )
}
