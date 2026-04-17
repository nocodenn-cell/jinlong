"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SignOutButton } from "@/components/auth/SignOutButton"
import type { Mensagens } from "@/src/lib/i18n/getMessages"
import type { Idioma } from "@/src/lib/idioma/normalizeIdioma"

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
      className="shrink-0 px-4 sm:px-6 py-3 border-b border-slate-800 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      style={fontStack ? { fontFamily: fontStack } : undefined}
    >
      <div className="flex items-start justify-between gap-3 sm:block">
        <div className="text-sm min-w-0">
          <div className="font-semibold text-slate-50">{m.caixa.titulo_pdv}</div>
          <div className="text-xs text-slate-400">
            {new Date().toLocaleString(
              idioma === "pt" ? "pt-BR" : idioma === "zh-HK" ? "zh-HK" : "zh-CN",
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SignOutButton
            label={m.comum.sair}
            className="rounded-md border border-slate-600 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-slate-50"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-slate-50 text-xs h-8"
            onClick={alternarTecnico}
          >
            {mostrarTecnico ? m.caixa.ocultar_tecnico : m.caixa.mostrar_tecnico}
          </Button>
        </div>
      </div>

      <div className="text-xs text-slate-400 sm:text-right sm:max-w-xl min-w-0">
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {caixaStatus?.aberto ? (
            <>
              <span className="rounded-md border border-emerald-600/40 bg-emerald-900/20 px-2 py-1 text-emerald-300">
                Caixa aberto
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-amber-600/60 bg-amber-900/20 text-amber-200 hover:bg-amber-800/30"
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
              className="border-emerald-600/60 bg-emerald-900/20 text-emerald-200 hover:bg-emerald-800/30"
              onClick={onAbrirCaixa}
              disabled={processandoCaixa}
              aria-busy={processandoCaixa}
            >
              {processandoCaixa ? `${m.caixa.abrir}...` : m.caixa.abrir}
            </Button>
          )}
        </div>
        {caixaStatus?.aberto && (
          <div className="mt-1 text-[11px] text-slate-300">
            Abertura:{' '}
            {new Date(caixaStatus.dataAbertura).toLocaleString(
              idioma === 'pt' ? 'pt-BR' : idioma === 'zh-HK' ? 'zh-HK' : 'zh-CN',
            )}{' '}
            · Inicial: R$ {caixaStatus.valorInicial.toFixed(2)}
            {!caixaStatus.blindClosureEnabled && (
              <>
                {' '}
                · Saldo estimado (dinheiro): R$ {caixaStatus.valorSistemaDinheiro.toFixed(2)}
              </>
            )}
          </div>
        )}
        <div>{m.caixa.atalhos_placeholder}</div>
        <div className="mt-1">
          {m.caixa.regras_catalogo}{" "}
          <code className="text-slate-500">regras_preco</code>
          {carregandoRegras ? ` · ${m.caixa.regras_carregando}` : ""}
        </div>
        {mostrarTecnico && (
          <div className="mt-2 text-slate-300/90 border border-slate-600/40 rounded-md px-2 py-1.5 bg-slate-950/50 text-left">
            {m.caixa.tech_finalizar_hint}
          </div>
        )}
      </div>
    </header>
  )
}
