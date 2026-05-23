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
  void m
  void caixaFmt
  const leadMin = parseIntegerConfig(configCaixaWeb.lead_time_min_dias, 30)
  const leadMax = parseIntegerConfig(configCaixaWeb.lead_time_max_dias, 60)
  void leadMin
  void leadMax
  return null
}
