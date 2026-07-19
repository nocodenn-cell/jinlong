import Link from 'next/link'
import { EmptyState } from '@/components/ui/feedback'
import { ROUTES } from '@shared-core/navigation/routes'

const MODULE_LINKS = [
  { href: ROUTES.admin.catalogo, label: 'Catálogo' },
  { href: ROUTES.admin.estoque, label: 'Estoque' },
  { href: ROUTES.admin.vendas, label: 'Vendas' },
  { href: ROUTES.admin.financeiro, label: 'Financeiro' },
] as const

/** Estado sem snapshot/records — sem inventar projeções. */
export function EmptyIntelligenceState() {
  return (
    <div className="space-y-4">
      <EmptyState
        title="Nenhuma projeção disponível"
        description="Ainda não há Decision Snapshot persistido para esta loja. O cockpit só lê o Read Model — a geração periódica virá do scheduler (Fase 5)."
      />
      <nav aria-label="Módulos oficiais" className="flex flex-wrap gap-3 text-caption">
        {MODULE_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-fg hover:bg-[var(--color-surface-muted)]"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
