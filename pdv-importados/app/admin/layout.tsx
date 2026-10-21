import { type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getAdminContext } from '@/lib/admin/context/adminContext'
import { resolveAdminSession } from '@/lib/admin/auth/resolveAdminSession'
import type { AdminSession } from '@/lib/admin/auth/types'
import { AdminToastViewport, AdminV2Shell } from '@/components/ui/admin-v2'
import { contarEstoqueBaixo, lerFlagsVisuaisPdv } from '@/lib/admin/sinaisVisuaisAdmin'
import { AvisoAssinatura } from '@/lib/cobranca/AvisoAssinatura'
import { createClient } from '@/lib/supabase/server'
import { listarEmpresasDoUsuario } from '@/lib/multiempresa/selecionarEmpresa'
import { resolverTopbarEmpresa } from '@/lib/admin/topbarEmpresa'
import type { AdminV2TopbarContext } from '@/components/ui/admin-v2/AdminV2Topbar'
import { modulosAtivosDaSessao } from '@/lib/import/hub/gateImportacoes'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

/**
 * Layout UI — não decide autorização (feita no edge via adminPolicy).
 * Fallback de renderização: exige AdminSession resolvida para montar o shell.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  let session: AdminSession | null = null
  try {
    session = await resolveAdminSession()
  } catch {
    redirect('/login?reason=erro_carregamento')
  }

  if (!session) {
    redirect('/login?next=/admin')
  }

  const adminContext = getAdminContext(session, { pathname: '/admin', resource: 'route:/admin' })

  // Observabilidade visual (flag `pdv_config.show_stock_alerts`): badge na sidebar.
  // Best-effort — qualquer falha mantém o shell idêntico ao comportamento atual (sem badge).
  let stockAlertCount: number | undefined
  // Leituras com cache por request: o Dashboard reaproveita o mesmo resultado.
  try {
    const { data: cfgRows } = await lerFlagsVisuaisPdv()
    const cfg = Array.isArray(cfgRows) ? cfgRows[0] : cfgRows
    if (cfg?.show_stock_alerts) {
      const { count } = await contarEstoqueBaixo()
      stockAlertCount = count ?? 0
    }
  } catch {
    stockAlertCount = undefined
  }

  // Barra superior: nome da empresa ativa (mesma leitura RLS da tela /selecionar-empresa).
  // Best-effort — falha ⇒ barra sem o bloco da empresa.
  let topbar: AdminV2TopbarContext | undefined
  try {
    const supabase = await createClient()
    const empresas = await listarEmpresasDoUsuario(supabase, session.userId)
    topbar = resolverTopbarEmpresa(empresas, session.empresaId ?? null)
  } catch {
    topbar = undefined
  }

  // Módulos opcionais (licença por empresa): best-effort; falha = nenhum módulo no menu.
  const modulosAtivos = await modulosAtivosDaSessao()

  return (
    <>
      <AdminV2Shell session={adminContext.session} stockAlertCount={stockAlertCount} topbar={topbar} modulosAtivos={modulosAtivos}>
        <AvisoAssinatura />
        {children}
      </AdminV2Shell>
      <AdminToastViewport />
    </>
  )
}
