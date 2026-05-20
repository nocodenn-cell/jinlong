'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type GerenteNavLinkProps = {
  href: string
  active: boolean
  children: ReactNode
}

export function GerenteNavLink({ href, active, children }: GerenteNavLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-sm font-medium no-underline transition-colors',
        active
          ? 'app-border app-accent-text app-surface-soft'
          : 'app-border app-surface app-surface-text hover:app-accent-text',
      )}
    >
      {children}
    </Link>
  )
}
