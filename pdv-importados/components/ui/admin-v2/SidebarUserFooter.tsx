import Link from 'next/link'
import type { AdminSession } from '@/lib/admin/auth/types'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'
import { AdminV2UtilityBar } from './AdminV2UtilityBar'

type SidebarUserFooterProps = {
  session: AdminSession
}

function initialsFromName(name: string): string {
  const normalized = name.trim()
  if (!normalized) return 'U'
  const parts = normalized.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function resolveUserName(session: AdminSession): string {
  const metadata = session.user.user_metadata as Record<string, unknown> | null
  const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : ''
  if (fullName) return fullName
  const name = typeof metadata?.name === 'string' ? metadata.name.trim() : ''
  if (name) return name
  const emailLocal = session.user.email?.split('@')[0]?.trim()
  if (emailLocal) return emailLocal
  return 'Usuário'
}

function resolveCargo(session: AdminSession): string {
  if (session.perfil === 'DONO') return 'Dono'
  if (session.perfil === 'ADMIN') return 'Administrador'
  if (session.perfil === 'GERENTE') return 'Gerente'
  return 'Operador'
}

export function SidebarUserFooter({ session }: SidebarUserFooterProps) {
  const name = resolveUserName(session)
  const cargo = resolveCargo(session)
  const initials = initialsFromName(name)
  const trocarSenha = getMessages(session.idioma).login.link_trocar_senha

  return (
    <footer className="mt-auto border-t border-[var(--admin-v2-border)] p-4">
      <div className="flex items-center gap-3 rounded-lg border border-[var(--admin-v2-border)] bg-[var(--color-background-secondary)] p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.12)] text-xs font-semibold text-[var(--color-brand-primary)]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-jl-fg-1">{name}</p>
          <p className="truncate text-xs text-jl-fg-3">{cargo}</p>
          <Link
            href={ROUTES.auth.changePassword}
            className="mt-1 inline-block text-xs text-[var(--color-brand-primary)] underline underline-offset-2 hover:opacity-90"
          >
            {trocarSenha}
          </Link>
        </div>
      </div>
      {/* Idioma e Sair moram aqui (lugar fixo), não no cabeçalho de cada página. */}
      <AdminV2UtilityBar className="mt-3 justify-between" />
    </footer>
  )
}
