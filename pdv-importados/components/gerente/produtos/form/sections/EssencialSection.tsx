'use client'

import type { RefObject } from 'react'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import type { UnidadeCode } from '../produtoForm.types'

type Props = Readonly<{
  nomeRef?: RefObject<HTMLInputElement | null>
  onEnterSubmit?: () => void
}>

export function EssencialSection({ nomeRef, onEnterSubmit }: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputClassName, inputMonoClassName, selectClassName } = ctx

  return (
    <section aria-labelledby="produto-secao-essencial">
      <ProdutoFormSectionHeading title={p.secao_essencial} />
      <p className="mt-1 text-[11px] text-jl-fg-3">{p.hint_essencial_obrigatorios}</p>
      <div id="produto-secao-essencial" className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.nome} *
          <input
            ref={nomeRef}
            className={`${inputClassName} mt-1`}
            value={ctx.nome}
            onChange={(e) => ctx.setNome(e.target.value)}
            disabled={disabled}
            placeholder={p.nome}
            autoComplete="off"
            onKeyDown={
              onEnterSubmit
                ? (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onEnterSubmit()
                    }
                  }
                : undefined
            }
          />
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.unidade_medida} *
            <select
              className={`${selectClassName} mt-1`}
              value={ctx.unidadeMedida}
              onChange={(e) => ctx.setUnidadeMedida(e.target.value as UnidadeCode)}
              disabled={disabled}
            >
              <option value="UN">{p.unidade_medida_un}</option>
              <option value="KG">{p.unidade_medida_kg}</option>
              <option value="CX">{p.unidade_medida_cx}</option>
              <option value="FD">{p.unidade_medida_fd}</option>
              <option value="M">{p.unidade_medida_m}</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.codigo_barras}
            <input
              className={`${inputMonoClassName} mt-1`}
              value={ctx.codigoBarras}
              onChange={(e) => ctx.setCodigoBarras(e.target.value)}
              disabled={disabled}
              placeholder={p.codigo_barras_opcional}
              autoComplete="off"
            />
            <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.hint_codigo_barras}</span>
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.codigo_interno_label}
            <input
              className={`${inputMonoClassName} mt-1`}
              value={ctx.codigoInterno}
              onChange={(e) => ctx.setCodigoInterno(e.target.value)}
              disabled={disabled}
              placeholder={p.codigo_interno_placeholder}
              autoComplete="off"
            />
            <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.hint_codigo_interno}</span>
          </label>
        </div>
      </div>
    </section>
  )
}
