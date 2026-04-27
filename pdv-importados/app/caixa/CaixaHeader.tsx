"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SignOutButton } from "@/components/auth/SignOutButton"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { DragonIcon } from "@/components/icons/DragonIcon"
import { Logo } from "@/components/branding/Logo"

const TECH_STORAGE_KEY = "fastproduct-caixa-mostrar-tecnico"

type Props = {
  m: Mensagens
  idioma: Idioma
  carregandoRegras: boolean
  caixaStatus:
    | {
        aberto: true
        dataAbertura: string
        valorInicial: number
        valorSistemaDinheiro: number
        blindClosureEnabled: boolean
      }
    | { aberto: false }
    | null
  processandoCaixa: boolean
  onAbrirCaixa: () => void
  onFecharCaixa: () => void
}

export function CaixaHeader({
  m,
  idioma,
  carregandoRegras,
  caixaStatus,
  processandoCaixa,
  onAbrirCaixa,
  onFecharCaixa,
}: Props) {
  const [mostrarTecnico, setMostrarTecnico] = useState(false)

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(TECH_STORAGE_KEY)
      setMostrarTecnico(v === "1")
    } catch {
      setMostrarTecnico(false)
    }
  }, [])

  const alternarTecnico = useCallback(() => {
    setMostrarTecnico((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(TECH_STORAGE_KEY, next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const fontStack =
    idioma === "zh"
      ? 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
      : idioma === "zh-HK"
        ? 'var(--font-noto-tc),"Noto Sans TC","MingLiU","Microsoft JhengHei",sans-serif'
        : undefined

  return (
    <header
      className="shrink-0 px-4 sm:px-6 py-3 border-b flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between app-divider app-surface-soft"
      style={fontStack ? { fontFamily: fontStack } : undefined}
    >
      <div className="flex items-start justify-between gap-3 sm:block">
        <div className="text-sm min-w-0 flex items-start gap-3">
          <Logo
            variant="symbol"
            href="/caixa"
            aria-label={m.login.nav_marca}
            className="app-accent-text shrink-0 mt-0.5"
          />
          <div>
          <div className="font-semibold">{m.caixa.titulo_pdv}</div>
          <div className="text-xs app-muted">
            {new Date().toLocaleString(
              idioma === "pt" ? "pt-BR" : idioma === "zh-HK" ? "zh-HK" : "zh-CN",
            )}
          </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SignOutButton
            label={m.comum.sair}
            className="rounded-md px-2.5 py-1 text-xs font-medium app-btn-neutral"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-8 app-btn-neutral"
            onClick={alternarTecnico}
          >
            {mostrarTecnico ? m.caixa.ocultar_tecnico : m.caixa.mostrar_tecnico}
          </Button>
        </div>
      </div>

      <div className="text-xs app-muted sm:text-right sm:max-w-xl min-w-0">
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {caixaStatus?.aberto ? (
            <>
              <span className="rounded-md px-2 py-1 app-badge-positive">
                Caixa aberto
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="app-badge-warn"
                onClick={onFecharCaixa}
                disabled={processandoCaixa}
                aria-busy={processandoCaixa}
              >
                {processandoCaixa ? `${m.caixa.fechar}...` : m.caixa.fechar}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="app-badge-positive"
              onClick={onAbrirCaixa}
              disabled={processandoCaixa}
              aria-busy={processandoCaixa}
            >
              {processandoCaixa ? `${m.caixa.abrir}...` : m.caixa.abrir}
            </Button>
          )}
        </div>
        {caixaStatus?.aberto && (
          <div className="mt-1 text-[11px] app-muted">
            Abertura:{' '}
            {new Date(caixaStatus.dataAbertura).toLocaleString(
              idioma === 'pt' ? 'pt-BR' : idioma === 'zh-HK' ? 'zh-HK' : 'zh-CN',
            )}{' '}
            · Inicial: R$ {caixaStatus.valorInicial.toFixed(2)}
          </div>
        )}
        {caixaStatus?.aberto && !caixaStatus.blindClosureEnabled && (
          <div className="mt-3 flex flex-col items-end relative group max-sm:items-start">
            <DragonIcon className="pointer-events-none w-12 h-12 sm:w-14 sm:h-14 absolute -right-1 -top-2 sm:-right-2 sm:-top-3 app-subtle opacity-45 transition-all duration-700 rotate-12" />
            <span className="text-[10px] app-subtle uppercase font-bold tracking-tight relative z-10">
              {m.caixa.header_guardiao_saldo_eyebrow}
            </span>
            <div className="flex items-center gap-2 app-accent-text font-mono text-base sm:text-lg font-semibold tabular-nums relative z-10">
              R$ {caixaStatus.valorSistemaDinheiro.toLocaleString(
                idioma === 'pt' ? 'pt-BR' : idioma === 'zh-HK' ? 'zh-HK' : 'zh-CN',
                { minimumFractionDigits: 2 },
              )}
            </div>
          </div>
        )}
        <div>{m.caixa.atalhos_placeholder}</div>
        <div className="mt-1">
          {m.caixa.regras_catalogo}{" "}
          <code className="app-subtle">regras_preco</code>
          {carregandoRegras ? ` · ${m.caixa.regras_carregando}` : ""}
        </div>
        {mostrarTecnico && (
          <div className="mt-2 rounded-md px-2 py-1.5 text-left app-surface app-border">
            {m.caixa.tech_finalizar_hint}
          </div>
        )}
      </div>
    </header>
  )
}
