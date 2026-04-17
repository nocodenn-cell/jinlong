import type { ReactNode } from 'react'

type GerenteFilterBarProps = Readonly<{
  title: string
  rightSlot?: ReactNode
  children?: ReactNode
}>

/** Barra de título + filtros/ações à esquerda e slot opcional à direita (ex.: exportar). */
export function GerenteFilterBar({ title, rightSlot, children }: GerenteFilterBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{title}</h1>
        {children}
      </div>
      {rightSlot}
    </div>
  )
}
