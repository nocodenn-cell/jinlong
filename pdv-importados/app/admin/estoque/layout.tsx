import type { ReactNode } from 'react'
import '@/styles/estoque-operacional.css'

export default function EstoqueLayout({ children }: { children: ReactNode }) {
  return <div className="estoque-operacional">{children}</div>
}
