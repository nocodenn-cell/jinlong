import { GerenteListPageRouteSkeleton } from '@/components/gerente/GerenteRouteLoading'

export default function ClientesLoading() {
  return <GerenteListPageRouteSkeleton cols={[40, 200, 120, 100, 80, 48]} rows={10} />
}
