import type { ReactNode } from 'react'

/**
 * Garante que toda a árvore admin renderize sob o tema Clássico,
 * isolando qualquer override de tema de camadas superiores.
 */
export function AdminThemeScope({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div data-app-theme="classico" className="contents">
      {children}
    </div>
  )
}
