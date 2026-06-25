'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { ROUTES } from '@shared-core/navigation/routes'

/**
 * Aplica o tema "clássico" (Design System Bling) APENAS nas rotas migradas.
 *
 * Enquanto a migração avança módulo a módulo, esta lista controla quais telas
 * já usam o tema Clássico. As demais continuam no tema atual (Dragon/noturno)
 * sem qualquer alteração visual. À medida que cada módulo for migrado e
 * validado, sua rota entra aqui.
 *
 * Marca um wrapper `display:contents` (não interfere no layout) com
 * `data-theme="classico"`; as custom properties do tema cascateiam para toda a
 * subárvore — shell, sidebar, topbar e conteúdo — sem tocar na lógica.
 */
const CLASSICO_ROUTES: readonly string[] = [ROUTES.admin.dashboard]

function isClassicoRoute(pathname: string): boolean {
  return CLASSICO_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
}

export function AdminThemeScope({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const classico = isClassicoRoute(pathname ?? '')

  return (
    <div className="contents" data-theme={classico ? 'classico' : undefined}>
      {children}
    </div>
  )
}
