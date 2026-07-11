import { AdminRouteLoading } from '@/components/branding/AdminRouteLoading'

/**
 * Fallback de Suspense do segmento /admin. Cobre a transição para qualquer
 * rota /admin/* que não tenha um loading.tsx mais próximo — dá feedback visual
 * institucional (auditoria UX §1.4) no lugar do bloco cinza anterior.
 */
export default function AdminLoading() {
  return <AdminRouteLoading />
}
