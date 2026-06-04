'use client'

/**
 * AdminNavLinkClient — item de navegação ativo/inativo baseado na rota atual.
 *
 * Client Component mínimo (apenas usePathname). Renderizado pelo layout RSC.
 * Recebe o ícone como LucideIcon para type-safety sem serialização.
 */

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type LucideIcon } from 'lucide-react'

type Props = Readonly<{
  href: string
  label: string
  badge?: string
  icon: LucideIcon
}>

export default function AdminNavLinkClient({ href, label, badge, icon: Icon }: Props) {
  const pathname = usePathname()

  // Ativo: rota exata ou subrota — /admin/dashboard ativo para /admin/dashboard/*
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href + '/'))

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`fp-nav-item${isActive ? ' fp-nav-item--active' : ''}`}
    >
      <Icon
        className="fp-nav-item__icon"
        size={15}
        aria-hidden="true"
        strokeWidth={isActive ? 2 : 1.6}
      />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      {badge && (
        <span className="fp-nav-item__badge" aria-label={`(${badge})`}>
          {badge}
        </span>
      )}
    </Link>
  )
}
