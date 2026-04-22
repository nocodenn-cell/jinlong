import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

const baseStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 13,
  textDecoration: 'none',
}

export type GerenteNavLinkProps = {
  href: string
  active: boolean
  children: ReactNode
}

/** Link de navegação secundária (abas / filtros) no painel gerente — estilo único para reuso e testes. */
export function GerenteNavLink({ href, active, children }: GerenteNavLinkProps) {
  return (
    <Link
      href={href}
      style={{
        ...baseStyle,
        background: active ? '#111827' : '#f3f4f6',
        color: active ? '#fff' : '#111827',
        border: active ? 'none' : '1px solid #e5e7eb',
      }}
    >
      {children}
    </Link>
  )
}
