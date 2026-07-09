'use client'

import type { RefObject } from 'react'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import { FornecedorCombobox } from '../fields/FornecedorCombobox'
import type { Idioma } from '@/idioma/normalizeIdioma'

type Props = Readonly<{
  nomeRef?: RefObject<HTMLInputElement | null>
  onEnterSubmit?: () => void
  idioma: Idioma
}>

export function EssencialSection({ nomeRef, onEnterSubmit, idioma }: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputClassName, inputMonoClassName, selectClassName } = ctx

  return (
    <section aria-labelledby="produto-secao-essencial">
      <ProdutoFormSectionHeading title={p.secao_essencial} />
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
                ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnterSubmit() } }
                : undefined
            }
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_varejo} *
            <input
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.precoVarejoInput.display}
              onChange={ctx.precoVarejoInput.onChange}
              disabled={disabled}
              placeholder="0,00"
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_atacado}
            <input
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.precoAtacadoInput.display}
              onChange={ctx.precoAtacadoInput.onChange}
              disabled={disabled}
              placeholder="—"
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.qtd_gatilho_atacado}
            <input
              type="text"
              inputMode="numeric"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.quantidadeGatilho}
              onChange={(e) => ctx.setQuantidadeGatilho(e.target.value.replace(/\D/g, ''))}
              disabled={disabled}
              placeholder="—"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </label>
          <div>
            <p className="text-xs font-medium text-jl-fg-3" id="produto-fornecedor-label">
              {p.fornecedor_principal_label}
            </p>
            <div className="mt-1">
              <FornecedorCombobox
                p={p}
                fornecedores={ctx.opcoes.fornecedores}
                value={ctx.fornecedorId}
                onChange={ctx.setFornecedorId}
                onFornecedoresChange={ctx.onFornecedoresChange}
                disabled={disabled}
                selectClassName={selectClassName}
                idioma={idioma}
                label={p.fornecedor_principal_label}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
