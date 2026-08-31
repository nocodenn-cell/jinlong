'use client'

import { criarMarcaProduto } from '@/app/gerente/marcas-produtos/actions'
import {
  opcoesSelecionaveis,
  selecionadaEstaInativa,
} from '@/core/catalog/opcoesCadastro'
import { SelectComCadastroRapido } from '../fields/SelectComCadastroRapido'
import { useProdutoFormContext } from '../ProdutoFormContext'

/**
 * Seletor de marca com cadastro rápido — SEMPRE visível (modo simples e
 * completo), mesmo padrão de CategoriaQuickField/FornecedorQuickField
 * (Sprint UX Onda 1). Antes ficava escondida atrás do "Modo completo",
 * custando um clique de toggle a mais que categoria/fornecedor para uma
 * classificação básica do produto.
 */
export function MarcaQuickField() {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const c = ctx.m.comum
  const { disabled, selectClassName, opcoes } = ctx

  // Mesma regra da categoria: marca inativa sai das escolhas novas mas continua
  // listada se for a do produto aberto — esconder faria o campo aparecer vazio
  // para um produto que tem marca. Ver
  // Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md.
  const marcas = opcoesSelecionaveis(opcoes.marcas, ctx.marcaId)
  const marcaAvisoInativa = selecionadaEstaInativa(opcoes.marcas, ctx.marcaId)
    ? p.marca_inativa_aviso
    : null

  return (
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
  )
}
