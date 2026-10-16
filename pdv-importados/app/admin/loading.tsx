import { Loading } from '@/components/ui/feedback/Loading'

/**
 * Carregamento entre abas do admin: selo Jīn Lóng girando na área de conteúdo (sidebar/topo seguem
 * visíveis). `route-loader-delayed` só revela o selo após ~150ms — navegações rápidas não piscam.
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" data-testid="admin-loading" className="route-loader-delayed">
      <Loading className="min-h-[60vh] bg-jl-surface-soft" variant="brand" />
    </div>
  )
}
