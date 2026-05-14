import React, { type ReactNode } from 'react'

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
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="gerente-page-title m-0 text-2xl font-semibold tracking-tight sm:text-[1.625rem] sm:leading-snug">
          {title}
        </h1>
        {children}
      </div>
      {rightSlot}
    </div>
  )
}
