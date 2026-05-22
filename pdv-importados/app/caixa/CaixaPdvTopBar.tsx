"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { SignOutButton } from "@/components/auth/SignOutButton"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import LanguageToggle from "@/app/caixa/idioma/LanguageToggle"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { turnoNumeroDeCaixaId } from "@/app/caixa/caixaPdvTurnoDisplay"
import { Clock, User, Wallet, LogOut, Languages } from "lucide-react"
import { DragonEmblemIcon } from "@/components/icons/DragonEmblemIcon"
import { cn } from "@/lib/utils"

export type CaixaPdvLayoutVariant = "default" | "classic"

type CaixaStatusTop =
  | {
      aberto: true
      caixaId: string
      valorSistemaDinheiro: number
      blindClosureEnabled: boolean
    }
  | { aberto: false }
  | null

type Props = {
  m: Mensagens
  idioma: Idioma
  layoutVariant: CaixaPdvLayoutVariant
  operadorLabel: string
  caixaStatus: CaixaStatusTop
  processandoCaixa: boolean
  onAbrirCaixa: () => void
  onFecharCaixa: () => void
}

function UserMenuDropdown({
  m,
  idioma,
  classic,
}: {
  m: Mensagens
  idioma: Idioma
  classic: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={m.caixa.topbar_usuario_menu_aria}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
          classic
            ? "border-primary-foreground/30 bg-white/10 text-primary-foreground hover:bg-white/25"
            : "border-amber-400/30 bg-amber-400/5 text-amber-400 hover:bg-amber-400/15",
        )}
      >
        <User className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 min-w-[13rem] overflow-hidden rounded-xl border shadow-2xl",
            classic
              ? "border-border bg-popover text-popover-foreground"
              : "border-jl-border-1 bg-jl-surface-elev text-foreground",
          )}
        >
          <div className="p-2">
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-jl-fg-3">
              {m.caixa.topbar_idioma_label}
            </p>
            <div className="px-2 pb-1">
              <LanguageToggle idiomaAtual={idioma} variant="dragon" />
            </div>

            <div className="my-2 border-t border-border/40" />

            <SignOutButton
              label={m.comum.sair}
              className="inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function StatusChip({
  icon,
  label,
  title,
  classic,
}: {
  icon: React.ReactNode
  label: string
  title?: string
  classic: boolean
}) {
  return (
    <span
      title={title ?? label}
      className={cn(
        "inline-flex items-center gap-1.5 truncate rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums",
        classic
          ? "border-primary-foreground/20 bg-white/[0.08] text-primary-foreground/90"
          : "border-amber-400/20 bg-amber-400/[0.06] text-jl-fg-1",
      )}
    >
      <span
        className={cn(
          "shrink-0",
          classic ? "text-primary-foreground/50" : "text-amber-400/70",
        )}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
  )
}

export function CaixaPdvTopBar({
  m,
  idioma,
  layoutVariant,
  operadorLabel,
  caixaStatus,
  processandoCaixa,
  onAbrirCaixa,
  onFecharCaixa,
}: Props) {
  const fontStack =
    idioma === "zh"
      ? 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
      : undefined

  const localeString = idioma === "pt" ? "pt-BR" : "zh-CN"

  const turnoLabel =
    caixaStatus?.aberto === true
      ? caixaFmt(m.caixa.topbar_turno_aberto, {
          n: turnoNumeroDeCaixaId(caixaStatus.caixaId),
        })
      : m.caixa.topbar_turno_fechado

  const fundoLabel =
    caixaStatus?.aberto !== true || caixaStatus.blindClosureEnabled
      ? null
      : caixaStatus.valorSistemaDinheiro.toLocaleString(localeString, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })

  const classic = layoutVariant === "classic"

  return (
    <header
      className={cn(
        "shrink-0 flex items-center gap-3 px-3 sm:px-5 py-2.5 border-b",
        classic
          ? "border-border bg-primary text-primary-foreground shadow-[0_2px_6px_0px_rgba(0,0,0,0.35)]"
          : "border-jl-border-1 bg-jl-surface-elev text-foreground",
      )}
      style={fontStack ? { fontFamily: fontStack } : undefined}
    >
      {/* ── Marca ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2">
        <DragonEmblemIcon
          className="h-8 w-8 shrink-0 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]"
          title="Jīn Lóng"
        />
        <span
          className={cn(
            "hidden text-base font-bold tracking-tight sm:block",
            classic ? "text-primary-foreground" : "text-foreground",
          )}
        >
          Jīn Lóng
        </span>
        <span
          className={cn(
            "hidden h-6 w-px sm:block",
            classic ? "bg-primary-foreground/20" : "bg-amber-400/25",
          )}
          aria-hidden
        />
        <span
          className={cn(
            "text-sm font-semibold",
            classic ? "text-primary-foreground/80" : "text-jl-fg-2",
          )}
        >
          {m.caixa.topbar_titulo}
        </span>
      </div>

      {/* ── Status chips ─────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5">
        <StatusChip
          icon={<Clock className="h-3.5 w-3.5" />}
          label={turnoLabel}
          classic={classic}
        />
        <StatusChip
          icon={<User className="h-3.5 w-3.5" />}
          label={operadorLabel}
          title={caixaFmt(m.caixa.topbar_operador, { nome: operadorLabel })}
          classic={classic}
        />
        {fundoLabel && (
          <StatusChip
            icon={<Wallet className="h-3.5 w-3.5" />}
            label={`${m.caixa.moeda_prefixo} ${fundoLabel}`}
            title={caixaFmt(m.caixa.topbar_fundo, {
              valor: `${m.caixa.moeda_prefixo} ${fundoLabel}`,
            })}
            classic={classic}
          />
        )}
      </div>

      {/* ── Ações ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2">
        {caixaStatus?.aberto ? (
          <Button
            type="button"
            size="sm"
            className={cn(
              "text-xs font-semibold sm:text-sm",
              classic
                ? "border border-primary-foreground/40 bg-white/15 text-primary-foreground hover:bg-white/25"
                : "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20",
            )}
            variant="ghost"
            onClick={onFecharCaixa}
            disabled={processandoCaixa}
            aria-busy={processandoCaixa}
          >
            {processandoCaixa ? `${m.caixa.fechar}…` : m.caixa.fechar}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className={cn(
              "text-xs font-semibold sm:text-sm",
              classic
                ? "border border-primary-foreground/40 bg-white/15 text-primary-foreground hover:bg-white/25"
                : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
            )}
            variant="ghost"
            onClick={onAbrirCaixa}
            disabled={processandoCaixa}
            aria-busy={processandoCaixa}
          >
            {processandoCaixa ? `${m.caixa.abrir}…` : m.caixa.abrir}
          </Button>
        )}

        <UserMenuDropdown m={m} idioma={idioma} classic={classic} />
      </div>
    </header>
  )
}
