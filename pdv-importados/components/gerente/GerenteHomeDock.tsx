import Link from 'next/link'

export type GerenteDockItem = {
  href: string
  label: string
}

interface GerenteHomeDockProps {
  items: GerenteDockItem[]
  ariaLabel: string
}

/**
 * Atalhos fixos na base da viewport (safe-area) para acesso rápido em mobile
 * e desktop. O conteúdo principal deve ter `padding-bottom` compatível
 * (ex.: `pb-24`).
 */
export function GerenteHomeDock({ items, ariaLabel }: GerenteHomeDockProps) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label={ariaLabel}
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-1 [-webkit-overflow-scrolling:touch] sm:justify-center sm:gap-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:text-sm"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
