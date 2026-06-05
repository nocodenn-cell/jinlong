/**
 * FastProduct Admin — Suspensão de Vendas (Fase 9)
 *
 * Server Component. Carrega status de suspensão via action.
 * Zero query nova — reutiliza actions existentes de /gerente/suspensao.
 */

import { carregarSuspensaoVendas } from '@/app/gerente/suspensao/actions'
import { SuspensaoContent } from './_components/SuspensaoContent'

export default async function AdminSuspensaoPage() {
  const res = await carregarSuspensaoVendas()
  const status = res.success ? res.data : { suspensas: false, motivo: '' }

  return <SuspensaoContent statusInicial={status} />
}
