import React, { type ReactNode } from 'react'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { CaixaCarrinhoAuthSync } from '@/app/caixa/CaixaCarrinhoAuthSync'

export const dynamic = 'force-dynamic'

export default function CaixaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionIdleLogout />
      <CaixaCarrinhoAuthSync />
      {children}
    </>
  )
}
