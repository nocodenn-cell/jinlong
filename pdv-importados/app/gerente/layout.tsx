import type { ReactNode } from 'react'

/**
 * Layout /gerente — shims de redirect para /admin (Sprint 4 / RFC-UX-020).
 * Não monta GerenteLayoutShell: evita flash visual antes do redirect (UX-P1-18).
 * Autorização permanece no edge (`adminPolicy` + middleware).
 */
export default function GerenteLayout({ children }: { children: ReactNode }) {
  return children
}
