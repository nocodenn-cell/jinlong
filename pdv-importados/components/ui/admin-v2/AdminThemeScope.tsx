'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { DEFAULT_THEME, resolveTheme } from '@/lib/theme/themeRegistry'

/**
 * Projeta o tema da rota atual na subárvore (shell, sidebar, topbar, conteúdo)
 * via `data-theme`, sem tocar na lógica dos componentes.
 *
 * É deliberadamente agnóstico de tema: pergunta ao registro qual tema vale e o
 * aplica. Adicionar novos temas não muda este componente. O tema base
 * (`DEFAULT_THEME`) é o comportamento não-escopado, então não marca atributo.
 *
 * Usa um wrapper `display:contents` (não interfere no layout); as custom
 * properties do tema cascateiam para toda a subárvore.
 */
export function AdminThemeScope({ children }: Readonly<{ children: ReactNode }>) {
  const theme = resolveTheme(usePathname() ?? '')

  return (
    <div className="contents" data-theme={theme === DEFAULT_THEME ? undefined : theme}>
      {children}
    </div>
  )
}
