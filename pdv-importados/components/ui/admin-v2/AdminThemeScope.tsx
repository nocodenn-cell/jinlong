'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { resolveTheme } from '@/lib/theme/themeRegistry'

/**
 * Aplica o tema visual da rota atual à subárvore (shell, sidebar, topbar e
 * conteúdo) sem tocar na lógica dos componentes.
 *
 * A decisão de QUAL rota usa QUAL tema vive no registro central
 * (`lib/theme/themeRegistry`) — este componente apenas projeta o resultado no
 * DOM via `data-theme`. Para o tema padrão ("dragon") nada é marcado, pois ele
 * é o comportamento base não-escopado.
 *
 * Usa um wrapper `display:contents` (não interfere no layout); as custom
 * properties do tema cascateiam para toda a subárvore.
 */
export function AdminThemeScope({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const theme = resolveTheme(pathname ?? '')

  return (
    <div className="contents" data-theme={theme === 'classico' ? 'classico' : undefined}>
      {children}
    </div>
  )
}
