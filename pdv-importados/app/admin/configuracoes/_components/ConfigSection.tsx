import type { ReactNode } from 'react'

/** Divisor de grupo dentro do formulário de Configurações (local à tela). */
export function ConfigSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-3 border-t border-[var(--color-border)] pt-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-small font-semibold text-fg">{title}</h3>
        {hint ? <p className="mt-0.5 text-caption text-fg-subtle">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}
