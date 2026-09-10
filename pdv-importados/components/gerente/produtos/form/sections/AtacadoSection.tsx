'use client'

import { useState, type ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { useProdutoFormContext } from '../ProdutoFormContext'

type Props = Readonly<{
  /** Editor de faixas (produto existente) ou os 2 campos do cadastro rápido. */
  faixasSlot: ReactNode
  /** Já existe faixa/preço de atacado neste produto — nasce aberto. */
  temAtacado: boolean
}>

/**
 * Atacado dentro de PREÇOS, não em "Mais detalhes".
 *
 * Antes este bloco morava em ComercialSection, que só renderiza com
 * `modoCompleto` e ainda por cima dentro de um <details> fechado chamado
 * "Classificação". No cadastro novo isso eram DOIS cliques + scroll para achar
 * "a partir de quantas unidades" — a função comercial central do Jinlong
 * escondida como configuração avançada.
 *
 * O checkbox NÃO apaga nada: desmarcar apenas recolhe. Remover faixa continua
 * sendo ação explícita do editor (inativa com ativo=false, sem delete físico).
 */
export function AtacadoSection({ faixasSlot, temAtacado }: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const [aberto, setAberto] = useState(temAtacado)

  return (
    <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.03] p-3">
      <div className="flex items-center gap-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-jl-fg-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-brand)]"
            checked={aberto}
            onChange={(e) => setAberto(e.target.checked)}
            disabled={ctx.disabled}
            data-field="atacado_ativar"
          />
          {p.titulo_faixas_atacado}
        </label>
        <span
          className="inline-flex text-jl-fg-3"
          title={p.atacado_tooltip}
          aria-label={p.atacado_tooltip}
        >
          <HelpCircle size={13} aria-hidden />
        </span>
      </div>

      {aberto ? <div className="mt-3">{faixasSlot}</div> : null}
    </div>
  )
}
