'use client'

import { criarMarcaProduto } from '@/app/gerente/marcas-produtos/actions'
import {
  opcoesSelecionaveis,
  selecionadaEstaInativa,
} from '@/core/catalog/opcoesCadastro'
import { SelectComCadastroRapido } from '../fields/SelectComCadastroRapido'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import type { OrigemCode } from '../produtoForm.types'

/**
 * Marca + origem — só no Cadastro Completo. Categoria e fornecedor ficam
 * sempre visíveis (`CategoriaQuickField`/`FornecedorQuickField`), presentes
 * também no Cadastro Rápido; esta seção cobre o que é só do Completo.
 */
export function ClassificacaoSection() {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const c = ctx.m.comum
  const { disabled, selectClassName, opcoes } = ctx

  // Marca inativa sai das escolhas novas mas continua listada se for a do
  // produto aberto — esconder faria o campo aparecer vazio para um produto
  // que tem marca. Ver Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md.
  const marcas = opcoesSelecionaveis(opcoes.marcas, ctx.marcaId)
  const marcaAvisoInativa = selecionadaEstaInativa(opcoes.marcas, ctx.marcaId)
    ? p.marca_inativa_aviso
    : null

  return (
    <section aria-labelledby="produto-secao-classificacao">
      <ProdutoFormSectionHeading title={p.secao_classificacao} />
      <div id="produto-secao-classificacao" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectComCadastroRapido
          label={p.marca_label}
          value={ctx.marcaId}
          onChange={ctx.setMarcaId}
          opcoes={marcas}
          hint={marcaAvisoInativa}
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
      </div>
    </section>
  )
}
