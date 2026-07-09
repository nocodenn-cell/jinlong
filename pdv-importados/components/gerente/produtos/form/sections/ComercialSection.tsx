'use client'

import type { ReactNode } from 'react'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import type { OrigemCode, UnidadeCode } from '../produtoForm.types'

type Props = Readonly<{
  faixasSlot: ReactNode
}>

export function ComercialSection({ faixasSlot }: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputClassName, inputMonoClassName, selectClassName, opcoes } = ctx

  return (
    <section aria-labelledby="produto-secao-comercial">
      <ProdutoFormSectionHeading title={p.secao_comercial} />
      <div id="produto-secao-comercial" className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.unidade_medida}
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
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.categoria_label}
            <select
              className={`${selectClassName} mt-1`}
              value={ctx.categoriaId}
              onChange={(e) => ctx.setCategoriaId(e.target.value)}
              disabled={disabled}
            >
              <option value="">{p.nenhuma_categoria}</option>
              {opcoes.categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.marca_label}
            <select
              className={`${selectClassName} mt-1`}
              value={ctx.marcaId}
              onChange={(e) => ctx.setMarcaId(e.target.value)}
              disabled={disabled}
            >
              <option value="">{p.nenhuma_marca}</option>
              {opcoes.marcas.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </label>
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
        </div>

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
          <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.nome_reduzido_pdv_hint}</span>
        </label>

        <label className="block text-xs font-medium text-jl-fg-3">
          {p.observacao}
          <textarea
            rows={2}
            className="mt-1 w-full resize-none rounded-md px-3 py-2 text-xs app-input !bg-white/[.08] !border-white/[.18]"
            value={ctx.observacao}
            onChange={(e) => ctx.setObservacao(e.target.value)}
            disabled={disabled}
            placeholder="—"
          />
        </label>

        <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.03] p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
            {p.titulo_faixas_atacado}
          </p>
          <p className="mb-2 text-[11px] text-jl-fg-3">{p.hint_faixas_atacado}</p>
          {faixasSlot}
        </div>
      </div>
    </section>
  )
}
