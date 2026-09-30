'use client'

import { Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/navigation/routes'

type Props = {
  title: string
  status: string
  openBtn: string
}

export function CaixaShortcut({ title, status, openBtn }: Props) {
  return (
    <div className="admin-v2-section-card flex items-center justify-between rounded-card px-5 py-3.5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-control bg-[var(--color-info-bg)]">
          <Monitor size={16} className="text-brand" aria-hidden />
        </div>
        <div>
          <p className="text-body font-medium text-fg">{title}</p>
          <p className="text-caption text-fg-subtle">{status}</p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm">
        <a href={ROUTES.caixa.home} target="_blank" rel="noopener noreferrer">
          {openBtn}
        </a>
      </Button>
    </div>
  )
}
