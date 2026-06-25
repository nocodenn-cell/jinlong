'use client'

import { type ReactNode, type ButtonHTMLAttributes } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'edit' | 'delete' | 'duplicate'

const VARIANT_CLASS: Record<Variant, string> = {
  default:   'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
  edit:      'text-slate-400 hover:bg-blue-50 hover:text-blue-600',
  delete:    'text-slate-400 hover:bg-red-50 hover:text-red-500',
  duplicate: 'text-slate-400 hover:bg-blue-50 hover:text-blue-600',
}

const BASE = 'flex h-7 w-7 items-center justify-center rounded-lg transition-colors'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  label: string
  children: ReactNode
}

export function TableRowActionBtn({ variant = 'default', label, children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANT_CLASS[variant], className)}
      {...rest}
    >
      {children}
    </button>
  )
}

type LinkProps = {
  variant?: Variant
  label: string
  href: string
  children: ReactNode
  className?: string
}

export function TableRowActionLink({ variant = 'default', label, href, children, className }: LinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANT_CLASS[variant], className)}
    >
      {children}
    </Link>
  )
}
