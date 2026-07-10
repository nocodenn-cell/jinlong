'use client'

import type { ReactNode } from 'react'
import { criarCategoriaProduto } from '@/app/gerente/categorias-produtos/actions'
import { criarMarcaProduto } from '@/app/gerente/marcas-produtos/actions'
import { FornecedorCombobox } from '../fields/FornecedorCombobox'
import { SelectComCadastroRapido } from '../fields/SelectComCadastroRapido'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { OrigemCode } from '../produtoForm.types'

type Props = Readonly<{
  faixasSlot: ReactNode
  idioma: Idioma
}>

export function ComercialSection({ faixasSlot, idioma }: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const c = ctx.m.comum
  const { disabled, inputClassName, inputMonoClassName, selectClassName, opcoes } = ctx

  return (
    <section aria-labelledby="produto-secao-comercial">
      <ProdutoFormSectionHeading title={p.secao_classificacao} />
      <p className="mt-1 text-[11px] text-jl-fg-3">{p.hint_classificacao_recomendados}</p>
      <div id="produto-secao-comercial" className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <SelectComCadastroRapido
            label={p.categoria_label}
            value={ctx.categoriaId}
            onChange={ctx.setCategoriaId}
            opcoes={opcoes.categorias}
            vazioLabel={p.nenhuma_categoria}
            disabled={disabled}
            selectClassName={selectClassName}
            modalTitulo={p.cadastro_rapido_categoria}
            modalNomeLabel={p.categoria_label}
            modalPlaceholder={p.categoria_label}
            cancelarLabel={c.cancelar}
            salvarLabel={c.salvar}
            salvandoLabel={c.carregando}
            onCriar={async (nome) => {
              const r = await criarCategoriaProduto({ nome })
              return r.success
                ? { success: true, id: r.data.id }
                : { success: false, error: r.error }
            }}
            onOpcaoCriada={(opcao) =>
              ctx.onCategoriasChange?.([...opcoes.categorias, opcao])
            }
          />
          <SelectComCadastroRapido
            label={p.marca_label}
            value={ctx.marcaId}
            onChange={ctx.setMarcaId}
            opcoes={opcoes.marcas}
            vazioLabel={p.nenhuma_marca}
            disabled={disabled}
            selectClassName={selectClassName}
            modalTitulo={p.cadastro_rapido_marca}
            modalNomeLabel={p.marca_label}
            modalPlaceholder={p.marca_label}
            cancelarLabel={c.cancelar}
            salvarLabel={c.salvar}
            salvandoLabel={c.carregando}
            onCriar={async (nome) => {
              const r = await criarMarcaProduto({ nome })
              return r.success
                ? { success: true, id: r.data.id }
                : { success: false, error: r.error }
            }}
            onOpcaoCriada={(opcao) => ctx.onMarcasChange?.([...opcoes.marcas, opcao])}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-jl-fg-3">{p.fornecedor_principal_label}</p>
            <div className="mt-1">
              <FornecedorCombobox
                p={p}
                fornecedores={opcoes.fornecedores}
                value={ctx.fornecedorId}
                onChange={ctx.setFornecedorId}
                onFornecedoresChange={ctx.onFornecedoresChange}
                disabled={disabled}
                selectClassName={selectClassName}
                idioma={idioma}
              />
            </div>
          </div>
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
            <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.hint_origem_tem_nf}</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            <span className="mt-0.5 block text-[10px] text-jl-fg-3">
              {p.nome_reduzido_pdv_hint}
            </span>
          </label>
        </div>

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
