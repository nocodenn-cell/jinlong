/**
 * FastProduct Admin — Layout Shell (Fase 1)
 *
 * REGRAS ABSOLUTAS:
 *  - Auth guard INTOCADO: isPerfilPainelGerencial + redirect('/caixa')
 *  - SessionIdleLogout MANTIDO (segurança)
 *  - Server Actions / queries Supabase: zero alteração
 *  - CSS scoped em [data-admin-layout="true"] — zero interferência com /gerente
 *
 * Nota: o `user.email` vem de `supabase.auth.getUser()` para o footer do sidebar.
 * Não adicionamos nova query ao banco — reutilizamos o `getUsuarioAtual` já existente.
 */

import React, { type ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  BarChart2,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Boxes,
  DollarSign,
  MoreHorizontal,
  MonitorPlay,
  type LucideIcon,
} from 'lucide-react'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { getUsuarioAtual } from '@/lib/auth/usuarioAtual'
import AdminNavLinkClient from './AdminNavLinkClient'
import '@/styles/admin-theme.css'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type NavSection = {
  readonly label: string
  readonly items: ReadonlyArray<NavItem>
}

type NavItem = {
  readonly key: string
  readonly label: string
  readonly icon: LucideIcon
  readonly href: string
  /** Opcional: exibe um badge de texto à direita (ex.: "↗" para "Abrir PDV") */
  readonly badge?: string
}

// ─── Navegação ────────────────────────────────────────────────────────────────
//
// Fase 1: hrefs apontam para as rotas /admin/* que existem e para /gerente/*
// enquanto as novas telas não estão criadas. A cada Fase seguinte, os hrefs
// são atualizados conforme as rotas /admin/* são adicionadas.
//
// Regra: NUNCA alterar os hrefs sem ter a rota correspondente funcionando.

const NAV_SECTIONS: ReadonlyArray<NavSection> = [
  {
    label: 'Gestão',
    items: [
      {
        key: 'dashboard',
        label: 'Visão geral',
        icon: LayoutDashboard,
        href: '/admin/dashboard',
      },
      {
        key: 'vendas',
        label: 'Vendas e caixa',
        icon: ShoppingCart,
        href: '/gerente/vendas',   // → /admin/vendas na Fase 5
      },
      {
        key: 'catalogo',
        label: 'Catálogo',
        icon: Package,
        href: '/gerente/produtos', // → /admin/catalogo na Fase 4
      },
      {
        key: 'estoque',
        label: 'Estoque',
        icon: Boxes,
        href: '/gerente/estoque',  // → /admin/estoque na Fase 5
      },
      {
        key: 'financeiro',
        label: 'Financeiro',
        icon: DollarSign,
        href: '/gerente/financeiro', // → /admin/financeiro na Fase 6
      },
      {
        key: 'relatorios',
        label: 'Relatórios',
        icon: BarChart2,
        href: '/gerente/relatorios', // → /admin/relatorios na Fase 6
      },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        key: 'configuracoes',
        label: 'Configurações',
        icon: Settings,
        href: '/gerente/configuracoes', // → /admin/configuracoes na Fase 7
      },
      {
        key: 'pdv',
        label: 'Ir para o PDV',
        icon: MonitorPlay,
        href: '/caixa',
        badge: '↗',
      },
    ],
  },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(email: string): string {
  const name = email.split('@')[0] ?? ''
  const parts = name.replace(/[._-]/g, ' ').trim().split(/\s+/)
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  return (name.slice(0, 2)).toUpperCase()
}

function getPerfilLabel(perfil: string): string {
  const map: Record<string, string> = {
    DONO: 'Proprietário',
    GERENTE: 'Gerente',
    ADMIN: 'Administrador',
    OPERADOR: 'Operador',
  }
  return map[perfil] ?? perfil
}

// ─── AdminSidebarServer (RSC) ─────────────────────────────────────────────────
// Servidor puro: lê sessão 1x por request (memoized via React cache no getUsuarioAtual).

async function AdminSidebarServer() {
  // Reutiliza a mesma chamada memoizada — zero round-trip extra ao Supabase.
  const usuario = await getUsuarioAtual()
  const email = '—'  // getUsuarioAtual não expõe email — usamos o perfil para o footer
  const perfilLabel = getPerfilLabel(usuario.perfil)
  const initials = usuario.userId ? (usuario.perfil.slice(0, 2)) : '??'

  return (
    <aside className="fp-sidebar" aria-label="Navegação principal">
      {/* ── Brand ── */}
      <div className="fp-sidebar__brand">
        <div className="fp-sidebar__logo-mark" aria-hidden="true">龍</div>
        <div className="fp-sidebar__brand-text">
          <div className="fp-sidebar__brand-name">JinLong</div>
          <div className="fp-sidebar__brand-sub">金龍科技</div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="fp-sidebar__nav" aria-label="Menu principal">
        {NAV_SECTIONS.map((section, si) => (
          <React.Fragment key={section.label}>
            {si > 0 && <div className="fp-sidebar__sep" role="separator" />}
            <div className="fp-sidebar__section-label">{section.label}</div>
            {section.items.map((item) => (
              <AdminNavLink key={item.key} item={item} />
            ))}
          </React.Fragment>
        ))}
      </nav>

      {/* ── Footer / user ── */}
      <div className="fp-sidebar__footer">
        <div className="fp-sidebar__user" role="group" aria-label="Conta do usuário">
          <div className="fp-sidebar__avatar" aria-hidden="true">
            {initials}
          </div>
          <div className="fp-sidebar__user-info">
            <div className="fp-sidebar__user-name">{email !== '—' ? email : perfilLabel}</div>
            <div className="fp-sidebar__user-role">{perfilLabel}</div>
          </div>
          <div className="fp-sidebar__user-action" aria-hidden="true">
            <MoreHorizontal size={14} />
          </div>
        </div>

        {/* Sign-out discreto abaixo do footer */}
        <SignOutButton
          label="Sair"
          className="mt-2 w-full rounded-md px-3 py-[6px] text-left text-[11px] text-zinc-600 transition-colors hover:bg-zinc-800/50 hover:text-zinc-400"
        />
      </div>
    </aside>
  )
}

// ─── Wrapper de conveniência ──────────────────────────────────────────────────

function AdminNavLink({ item }: { item: NavItem }) {
  return (
    <AdminNavLinkClient
      href={item.href}
      label={item.label}
      badge={item.badge}
      icon={item.icon}
    />
  )
}

// ─── AdminLayout (RSC, entry point) ──────────────────────────────────────────

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { perfil } = await getUsuarioIdioma()

  // ─── GUARD: idêntico ao layout existente — não alterar. ────────────────────
  if (!isPerfilPainelGerencial(perfil)) redirect('/caixa')

  return (
    <div data-admin-layout="true">
      {/* Segurança: logout por inatividade — MANTIDO INTOCADO */}
      <SessionIdleLogout />

      {/* Sidebar */}
      <AdminSidebarServer />

      {/* Conteúdo principal */}
      <div className="fp-main">
        {children}
      </div>
    </div>
  )
}
