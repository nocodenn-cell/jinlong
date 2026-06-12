'use client'

import { Monitor } from 'lucide-react'
import { ROUTES } from '@shared-core/navigation/routes'

type Props = {
  title: string
  status: string
  openBtn: string
}

export function CaixaShortcut({ title, status, openBtn }: Props) {
  return (
    <div className="admin-v2-section-card flex items-center justify-between rounded-xl px-5 py-3.5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-jl-card-l1-accent">
          <Monitor size={16} className="text-jl-accent" aria-hidden />
        </div>
        <div>
          <p className="text-[13px] font-medium text-jl-fg-1">{title}</p>
          <p className="text-[11px] text-jl-fg-3">{status}</p>
        </div>
      </div>
      <a
        href={ROUTES.caixa.home}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-jl-accent/35 bg-jl-card-l1-accent px-4 py-2 text-[12px] font-medium text-jl-accent transition-colors hover:border-jl-accent/50 hover:bg-jl-card-l1-accent/80"
      >
        {openBtn}
      </a>
    </div>
  )
}
