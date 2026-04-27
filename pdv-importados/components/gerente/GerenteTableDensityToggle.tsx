'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Mensagens } from '@/i18n/getMessages'
import type { GerenteTableDensity } from '@/components/gerente/GerenteTableDensityContext'
import { useGerenteTableDensityControls } from '@/components/gerente/GerenteTableDensityContext'

type Props = Readonly<{
  m: Mensagens
}>

function Seg({
  active,
  onClick,
  children,
}: Readonly<{ active: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
        active ? 'app-surface-soft app-accent-text ring-1 ring-[color:var(--accent)]' : 'app-muted hover:app-accent-text',
      )}
    >
      {children}
    </button>
  )
}

export function GerenteTableDensityToggle({ m }: Props) {
  const g = m.gerente
  const { density, setDensity } = useGerenteTableDensityControls()

  const set = (d: GerenteTableDensity) => () => setDensity(d)

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border p-0.5 shadow-sm app-border app-surface-soft"
      role="group"
      aria-label={g.table_density_aria}
    >
      <Seg active={density === 'compact'} onClick={set('compact')}>
        {g.table_density_compact}
      </Seg>
      <Seg active={density === 'comfort'} onClick={set('comfort')}>
        {g.table_density_comfort}
      </Seg>
    </div>
  )
}
