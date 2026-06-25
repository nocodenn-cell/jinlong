'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, ChevronRight, LogOut, Search } from 'lucide-react'
import { performClientLogout } from '@/lib/auth/clientLogout'
import { resetCarrinhoPersistido } from '@/lib/caixa/resetCarrinhoPersistido'
import { ROUTES } from '@shared-core/navigation/routes'

const ROUTE_LABELS: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/dashboard': 'Dashboard',
  '/admin/catalogo': 'Produtos',
  '/admin/catalogo/novo': 'Novo Produto',
  '/admin/estoque': 'Estoque',
  '/admin/estoque/recebimento': 'Recebimento',
  '/admin/estoque/transferencias': 'Transferências',
  '/admin/estoque/importar-nfe': 'Importar NF-e',
  '/admin/vendas': 'Vendas',
  '/admin/financeiro': 'Financeiro',
  '/admin/relatorios': 'Relatórios',
  '/admin/comissoes': 'Comissões',
  '/admin/configuracoes': 'Configurações',
  '/admin/auditoria': 'Auditoria',
  '/admin/categorias-produtos': 'Categorias de Produtos',
  '/admin/categorias-financeiras': 'Categorias Financeiras',
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

type AdminTopbarProps = {
  userName: string
  userCargo: string
}

export function AdminTopbar({ userName, userCargo }: AdminTopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const pageLabel = ROUTE_LABELS[pathname] ?? 'FastProduct'
  const initials = initialsFrom(userName)

  async function handleSignOut(e: React.MouseEvent) {
    e.preventDefault()
    if (loggingOut) return
    setLoggingOut(true)
    try {
      const res = await performClientLogout()
      if (!res.ok) return
      resetCarrinhoPersistido()
      router.push(ROUTES.auth.login)
      router.refresh()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-4 shadow-sm lg:px-6">
      {/* Breadcrumb */}
      <nav
        className="hidden items-center gap-1.5 text-sm sm:flex"
        aria-label="Navegação"
      >
        <span className="text-slate-400">FastProduct</span>
        <ChevronRight size={13} className="shrink-0 text-slate-300" aria-hidden />
        <span className="font-medium text-slate-700">{pageLabel}</span>
      </nav>

      {/* Search */}
      <div className="relative mx-auto w-full max-w-xs lg:mx-0">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Buscar…"
          aria-label="Busca global"
          className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-[#1a56db] focus:bg-white focus:ring-2 focus:ring-[#1a56db]/15"
        />
      </div>

      {/* Right actions */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Bell */}
        <button
          type="button"
          aria-label="Notificações"
          title="Notificações"
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-[#1a56db]/40 hover:text-[#1a56db]"
        >
          <Bell size={16} aria-hidden />
          <span
            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#1a56db] ring-2 ring-white"
            aria-hidden
          />
        </button>

        {/* Avatar */}
        <div
          className="flex h-9 w-9 select-none items-center justify-center rounded-full border border-[#1a56db]/25 bg-[#1a56db]/10 text-xs font-semibold text-[#1a56db]"
          title={`${userName} · ${userCargo}`}
          aria-label={`Perfil: ${userName}`}
        >
          {initials}
        </div>

        {/* Sign out */}
        <button
          type="button"
          onClick={(e) => void handleSignOut(e)}
          disabled={loggingOut}
          aria-label="Sair da conta"
          className="hidden h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 sm:flex"
        >
          <LogOut size={13} aria-hidden />
          <span>{loggingOut ? '…' : 'Sair'}</span>
        </button>
      </div>
    </header>
  )
}
