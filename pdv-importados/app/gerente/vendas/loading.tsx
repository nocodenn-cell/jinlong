import { GerenteListPageRouteSkeleton } from '@/components/gerente/GerenteRouteLoading'

export default function VendasLoading() {
  return <GerenteListPageRouteSkeleton cols={[80, 96, 160, 112, 80, 80]} rows={10} />
}
