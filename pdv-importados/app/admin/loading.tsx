'use client'

import { useContext } from 'react'
import { Loading } from '@/components/ui/feedback/Loading'
import { AdminV2SessionContext } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'

/**
 * Carregamento entre abas do admin: selo Jīn Lóng girando na área de conteúdo (sidebar/topo seguem
 * visíveis). `route-loader-delayed` só revela o selo após ~150ms — navegações rápidas não piscam.
 * Rótulo no idioma da sessão (contexto do AdminV2Shell; fora dele cai em pt).
 */
export default function AdminLoading() {
  const idioma = useContext(AdminV2SessionContext)?.idioma ?? 'pt'
  return (
    <div aria-busy="true" data-testid="admin-loading" className="route-loader-delayed">
      <Loading
        className="min-h-[60vh] bg-jl-surface-soft"
        label={getMessages(idioma).comum.carregando}
        variant="brand"
      />
    </div>
  )
}
