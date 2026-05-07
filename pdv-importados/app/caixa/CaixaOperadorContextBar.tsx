"use client"

import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"

type Props = {
  m: Mensagens
  idioma: Idioma
}

export function CaixaOperadorContextBar({ m, idioma }: Props) {
  void m
  void idioma
  return null
}
