"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/src/lib/i18n/getMessages"
import type { Idioma } from "@/src/lib/idioma/normalizeIdioma"

const TECH_STORAGE_KEY = "fastproduct-caixa-mostrar-tecnico"

type Props = {
  m: Mensagens
  idioma: Idioma
  carregandoRegras: boolean
}

export function CaixaHeader({ m, idioma, carregandoRegras }: Props) {
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-slate-50 text-xs h-8"
          onClick={alternarTecnico}
        >
          {mostrarTecnico ? m.caixa.ocultar_tecnico : m.caixa.mostrar_tecnico}
        </Button>
      </div>

      <div className="text-xs text-slate-400 sm:text-right sm:max-w-xl min-w-0">
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
