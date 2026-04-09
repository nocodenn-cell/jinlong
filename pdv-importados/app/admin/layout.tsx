import type { ReactNode } from 'react'
import Link from 'next/link'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'

const navItems = [
  { href: '/admin/dashboard', label: '控制台 / Dashboard' },
  { href: '/gerente', label: '经理面板 / Gerente' },
  { href: '/gerente/relatorios', label: '报告 / Relatórios' },
  { href: '/gerente/vendas', label: '销售 / Vendas' },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <SessionIdleLogout />
      <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-200 bg-white p-4 lg:p-5">
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-800">主控台</div>
            <div className="text-xs text-slate-500">Painel Master</div>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  )
}

