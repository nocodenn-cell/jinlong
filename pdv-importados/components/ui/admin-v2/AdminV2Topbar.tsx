import Link from 'next/link'
import { Bell, Building2 } from 'lucide-react'
import { ROUTES } from '@/lib/navigation/routes'
import type { Mensagens } from '@/i18n/getMessages'
import { CommandPaletteTrigger } from './CommandPaletteTrigger'
import { AdminV2UtilityBar } from './AdminV2UtilityBar'

export type AdminV2TopbarContext = {
  /** Nome da empresa ativa (leitura best-effort; `null` = não exibido). */
  empresaNome?: string | null
  /** Usuário com vínculo em mais de uma empresa ⇒ link para a tela de seleção já existente. */
  podeTrocarEmpresa?: boolean
}

type AdminV2TopbarProps = AdminV2TopbarContext & {
  ui: Mensagens['admin_ui']
  stockAlertCount?: number
}

/**
 * Barra superior fixa (>= lg): busca (paleta de comandos), empresa ativa, notificações e idioma/Sair.
 * Só lê dados já carregados pelo layout; nenhuma regra de negócio aqui.
 */
export function AdminV2Topbar({ ui, stockAlertCount, empresaNome, podeTrocarEmpresa }: AdminV2TopbarProps) {
  const alertas = stockAlertCount ?? 0
  const notifLabel =
    alertas > 0 ? ui.topbar_estoque_baixo.replace('{n}', String(alertas)) : ui.topbar_sem_notificacoes

  return (
    <header
      data-testid="admin-v2-topbar"
      className="admin-v2-topbar sticky top-0 z-30 hidden h-16 items-center justify-between gap-4 border-b border-[var(--admin-v2-border)] px-6 lg:flex"
    >
      <div className="w-full max-w-md">
        <CommandPaletteTrigger label={ui.command_palette_trigger} />
      </div>
      <div className="flex items-center gap-3">
        {empresaNome ? (
          <div className="flex items-center gap-2 text-right" data-testid="admin-v2-topbar-empresa">
            <Building2 className="h-4 w-4 text-[var(--color-brand-primary)]" aria-hidden />
            <div className="leading-tight">
              <p className="sr-only">{ui.topbar_empresa}</p>
              <p className="max-w-[16rem] truncate text-sm font-medium text-jl-fg-1">{empresaNome}</p>
              {podeTrocarEmpresa ? (
                <Link
                  href={`${ROUTES.auth.selecionarEmpresa}?next=${encodeURIComponent(ROUTES.admin.dashboard)}`}
                  className="text-xs text-[var(--color-brand-primary)] underline-offset-2 hover:underline"
                >
                  {ui.topbar_trocar_empresa}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
        <Link
          href={ROUTES.admin.estoque}
          aria-label={`${ui.topbar_notificacoes}: ${notifLabel}`}
          title={notifLabel}
          data-testid="admin-v2-topbar-notificacoes"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-jl-fg-2 transition-colors hover:bg-[var(--color-background-tertiary)] hover:text-jl-fg-1"
        >
          <Bell className="h-5 w-5" aria-hidden />
          {alertas > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--color-brand-primary)]" aria-hidden />
          ) : null}
        </Link>
        <AdminV2UtilityBar compact />
      </div>
    </header>
  )
}
