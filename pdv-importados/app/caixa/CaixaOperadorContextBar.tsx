"use client"

import { memo } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { parseIntegerConfig } from "@/lib/caixa/configuracoesGeraisCaixa"

type Props = Readonly<{
  m: Mensagens
  idioma: Idioma
  configCaixaWeb: Record<string, string>
}>

function CaixaOperadorContextBarImpl({ m, idioma, configCaixaWeb }: Props) {
  void idioma, configCaixaWeb
  return null
}

export const CaixaOperadorContextBar = memo(CaixaOperadorContextBarImpl)
