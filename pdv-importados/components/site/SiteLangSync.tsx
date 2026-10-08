'use client'

import { useEffect } from 'react'
import type { SiteLocale } from '@/lib/site/locales'

/**
 * O layout raiz do ERP fixa `<html lang="pt-BR">` e o `HydrationFix` o reescreve
 * a partir do cookie do operador. No site, o `lang` do documento acompanha a
 * página; ao sair, o valor anterior é restaurado para não afetar o ERP.
 */
export function SiteLangSync({ locale }: { locale: SiteLocale }) {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.lang
    root.lang = locale
    return () => {
      root.lang = previous
    }
  }, [locale])

  return null
}
