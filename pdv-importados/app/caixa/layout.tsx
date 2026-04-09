import type { ReactNode } from 'react'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'

export default function CaixaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionIdleLogout />
      {children}
    </>
  )
}
