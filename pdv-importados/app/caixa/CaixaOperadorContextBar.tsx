"use client"

import { memo } from "react"
import { X } from "lucide-react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { parseIntegerConfig } from "@/lib/caixa/configuracoesGeraisCaixa"

type Props = Readonly<{
  m: Mensagens
  idioma: Idioma
  configCaixaWeb: Record<string, string>
  /** Cliente vinculado ao cupom atual; `null` quando a venda é anônima. */
  clienteNome?: string | null
  onRemoverCliente?: () => void
}>

function CaixaOperadorContextBarImpl({
  m,
  idioma,
  configCaixaWeb,
  clienteNome,
  onRemoverCliente,
}: Props) {
  void idioma
  const leadMin = parseIntegerConfig(configCaixaWeb.lead_time_min_dias, 30)
  const leadMax = parseIntegerConfig(configCaixaWeb.lead_time_max_dias, 60)
  const leadTimeValido =
    Number.isFinite(leadMin) && Number.isFinite(leadMax) && leadMin > 0 && leadMax > 0

  if (!clienteNome && !leadTimeValido) return null

  return (
    <div className="flex flex-wrap gap-2">
      {clienteNome && (
        <span
          data-testid="caixa-chip-cliente"
          className="app-chip inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-caption"
        >
          <span className="text-fg-subtle">{m.caixa.cliente}:</span>
          <span className="font-semibold">{clienteNome}</span>
          {onRemoverCliente && (
            <button
              type="button"
              onClick={onRemoverCliente}
              aria-label={caixaFmt(m.caixa.cliente_remover_aria, { nome: clienteNome })}
              title={m.caixa.cliente_remover}
              className="-mr-1 rounded-full p-0.5 hover:bg-white/[0.08]"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </span>
      )}
      {leadTimeValido && (
        <span className="app-chip inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium">
          {caixaFmt(m.caixa.lead_time_importacao_banner, { min: leadMin, max: leadMax })}
        </span>
      )}
    </div>
  )
}

export const CaixaOperadorContextBar = memo(CaixaOperadorContextBarImpl)
