'use client'

import { useEffect } from 'react'

export function HydrationFix() {
  useEffect(() => {
    // Read language from cookie and update HTML lang attribute
    try {
      const m = document.cookie.match('(?:^|;)\\s*usuario_idioma=([^;]*)')
      const idioma = m ? decodeURIComponent(m[1]) : 'pt'
      document.documentElement.lang = idioma === 'zh' ? 'zh-CN' : 'pt-BR'
      if (idioma === 'zh') {
        document.body.classList.add('font-noto-sc')
      }
    } catch {
      // ignore
    }
  }, [])

  return null
}
