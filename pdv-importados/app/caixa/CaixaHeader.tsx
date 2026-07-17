"use client"

import { memo } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { ThermalStatus } from "@/hooks/useThermalPrinter"
import { CaixaPdvTopBar } from "@/app/caixa/CaixaPdvTopBar"
import type { CaixaStatusUi } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"

type Props = {
  m: Mensagens
  idioma: Idioma
  operadorLabel: string
  caixaStatus: CaixaStatusUi | null
  carregandoStatus: boolean
  processandoCaixa: boolean
  onAbrirCaixa: () => void
  onFecharCaixa: () => void
  onTentarStatusNovamente: () => void
  printerStatus?: ThermalStatus
  printerDeviceName?: string | null
}

function CaixaHeaderImpl({
  m,
  idioma,
  operadorLabel,
  caixaStatus,
  carregandoStatus,
  processandoCaixa,
  onAbrirCaixa,
  onFecharCaixa,
  onTentarStatusNovamente,
  printerStatus,
  printerDeviceName,
}: Props) {
  const fontStack =
    idioma === "zh"
      ? 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
      : undefined

  return (
    <div className="shrink-0 flex flex-col" style={fontStack ? { fontFamily: fontStack } : undefined}>
      <CaixaPdvTopBar
        m={m}
        idioma={idioma}
        operadorLabel={operadorLabel}
        caixaStatus={caixaStatus}
        carregandoStatus={carregandoStatus}
        processandoCaixa={processandoCaixa}
        onAbrirCaixa={caixaStatus?.status === "ERRO" ? onTentarStatusNovamente : onAbrirCaixa}
        onFecharCaixa={onFecharCaixa}
        printerStatus={printerStatus}
        printerDeviceName={printerDeviceName}
      />
    </div>
  )
}

export const CaixaHeader = memo(CaixaHeaderImpl)
