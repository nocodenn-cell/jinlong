'use client'

/**
 * FastProduct — PriceTooltip (observabilidade visual)
 *
 * Tooltip explicativo do preço de um item de venda: preço final, preço base,
 * tipo de preço aplicado e (quando existir) a regra/faixa de referência.
 * Sempre inclui o disclaimer "informação visual, não contábil".
 *
 * Controlado por `pdv_config.show_preco_fonte`: quando a flag está desligada,
 * o chamador simplesmente não deve renderizar este componente.
 */

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Info } from 'lucide-react'
import { formatBRL } from '@/lib/format/money'

const TIPO_PRECO_LABEL: Record<string, string> = {
  VAREJO: 'Varejo',
  ATACADO: 'Atacado',
  MANUAL: 'Manual',
  PROMOCAO: 'Promoção',
}

export function PriceTooltip({
  precoFinal,
  precoBase,
  tipoPreco,
  regraAplicadaId,
}: {
  precoFinal: number
  precoBase: number
  tipoPreco: string | null
  regraAplicadaId?: string | null
}) {
  const tipoLabel = tipoPreco ? TIPO_PRECO_LABEL[tipoPreco] ?? tipoPreco : '—'

  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="Detalhes do preço"
            className="inline-flex items-center text-jl-fg-3 transition-colors hover:text-jl-fg-1"
          >
            <Info size={12} strokeWidth={2} aria-hidden />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="top"
            sideOffset={6}
            className="z-50 max-w-[220px] rounded-lg border border-[#242424] bg-[#161616] px-3 py-2 text-[11px] text-jl-fg-2 shadow-lg"
          >
            <div className="flex flex-col gap-1">
              <Row label="Preço final" value={formatBRL(precoFinal)} />
              <Row label="Base" value={formatBRL(precoBase)} />
              <Row label="Tipo" value={tipoLabel} />
              {regraAplicadaId ? <Row label="Regra" value={regraAplicadaId.slice(0, 8)} /> : null}
              <p className="mt-1 border-t border-[#242424] pt-1 text-[10px] italic text-jl-fg-3">
                informação visual, não contábil
              </p>
            </div>
            <TooltipPrimitive.Arrow className="fill-[#161616]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-jl-fg-3">{label}</span>
      <span className="font-medium text-jl-fg-1">{value}</span>
    </div>
  )
}
