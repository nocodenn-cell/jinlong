"use client"

import { memo } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { parseIntegerConfig } from "@/lib/caixa/configuracoesGeraisCaixa"

type Props = Readonly<{
  m: Mensagens
  idioma: Idioma
  configCaixaWeb: Record<string, string>
  caixaAberto?: boolean
}>

function CaixaOperadorContextBarImpl({ m, idioma, configCaixaWeb, caixaAberto }: Props) {
  void idioma
  const leadMin = parseIntegerConfig(configCaixaWeb.lead_time_min_dias, 30)
  const leadMax = parseIntegerConfig(configCaixaWeb.lead_time_max_dias, 60)
  const showLeadTime = Number.isFinite(leadMin) && Number.isFinite(leadMax) && leadMin > 0 && leadMax > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Status do Caixa — BLOQUEADOR P2 CORRIGIDO */}
      {caixaAberto && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          ✅ {m.caixa.status_aberto || 'Caixa Aberto'}
        </span>
      )}

      {showLeadTime && (
        <span className="app-chip inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium">
          {caixaFmt(m.caixa.lead_time_importacao_banner, { min: leadMin, max: leadMax })}
        </span>
      )}
    </div>
  )
}

export const CaixaOperadorContextBar = memo(CaixaOperadorContextBarImpl)
