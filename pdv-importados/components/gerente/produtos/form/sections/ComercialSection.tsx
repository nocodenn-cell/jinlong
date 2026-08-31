'use client'

import type { ReactNode } from 'react'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import { FIN_TEXTAREA } from '../produtoFormStyles'
import type { OrigemCode } from '../produtoForm.types'

type Props = Readonly<{
  faixasSlot: ReactNode
  historicoSlot?: ReactNode
}>

export function ComercialSection({ faixasSlot, historicoSlot }: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputClassName, inputMonoClassName, selectClassName } = ctx

  return (
    <section aria-labelledby="produto-secao-comercial">
      <ProdutoFormSectionHeading title={p.secao_classificacao} />
      <p className="mt-1 text-caption text-jl-fg-3">{p.hint_classificacao_recomendados}</p>
      <div id="produto-secao-comercial" className="mt-3 space-y-3">
        {/* Categoria, fornecedor e marca saíram daqui para a área sempre
            visível (CategoriaQuickField / FornecedorQuickField / MarcaQuickField). */}
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.origem_label}
          <select
            className={`${selectClassName} mt-1`}
            value={ctx.origem}
            onChange={(e) => ctx.setOrigem(e.target.value as OrigemCode)}
            disabled={disabled}
          >
            <option value="china_manual">{p.origem_china}</option>
            <option value="brasil_nf">{p.origem_brasil_nf}</option>
            <option value="brasil_sem_nf">{p.origem_brasil_sem_nf}</option>
          </select>
          <span className="mt-0.5 block text-caption text-jl-fg-3">{p.hint_origem_tem_nf}</span>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.referencia_fornecedor_label}
            <input
              className={`${inputMonoClassName} mt-1`}
              value={ctx.referenciaFornecedor}
              onChange={(e) => ctx.setReferenciaFornecedor(e.target.value)}
              disabled={disabled}
              placeholder={p.referencia_fornecedor_placeholder}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.nome_reduzido_pdv_label}
            <input
              className={`${inputClassName} mt-1`}
              value={ctx.nomeReduzidoPdv}
              onChange={(e) => ctx.setNomeReduzidoPdv(e.target.value)}
              disabled={disabled}
              placeholder={p.nome}
              autoComplete="off"
            />
            <span className="mt-0.5 block text-caption text-jl-fg-3">
              {p.nome_reduzido_pdv_hint}
            </span>
          </label>
        </div>

        <label className="block text-xs font-medium text-jl-fg-3">
          {p.observacao}
          <textarea
            rows={2}
            className={FIN_TEXTAREA}
            value={ctx.observacao}
            onChange={(e) => ctx.setObservacao(e.target.value)}
            disabled={disabled}
            placeholder="—"
          />
        </label>

        <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.03] p-3">
          <p className="mb-1 text-caption font-semibold uppercase tracking-wider text-jl-fg-3">
            {p.titulo_faixas_atacado}
          </p>
          <p className="mb-2 text-caption text-jl-fg-3">{p.hint_faixas_atacado}</p>
          {faixasSlot}
        </div>

        {historicoSlot}
      </div>
    </section>
  )
}
