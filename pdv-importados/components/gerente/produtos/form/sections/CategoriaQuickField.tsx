'use client'

import { criarCategoriaProduto } from '@/app/gerente/categorias-produtos/actions'
import {
  opcoesSelecionaveis,
  selecionadaEstaInativa,
} from '@/core/catalog/opcoesCadastro'
import { SelectComCadastroRapido } from '../fields/SelectComCadastroRapido'
import { useProdutoFormContext } from '../ProdutoFormContext'

/**
 * Seletor de categoria com cadastro rápido — SEMPRE visível (modo simples e
 * completo). Categoria é campo primário do cadastro; antes ficava escondida
 * atrás do "Modo completo", custando um clique de toggle por produto novo.
 * Fonte única: é o único ponto onde a categoria é editada no formulário.
 */
export function CategoriaQuickField() {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const c = ctx.m.comum
  const { disabled, selectClassName, opcoes } = ctx

  // Categoria inativa sai das escolhas novas, mas continua listada se for a do
  // produto aberto — esconder faria o select cair no vazio e salvar apagaria o
  // vínculo. Ver Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md.
  const categorias = opcoesSelecionaveis(opcoes.categorias, ctx.categoriaId)
  const avisoInativa = selecionadaEstaInativa(opcoes.categorias, ctx.categoriaId)
    ? p.categoria_inativa_aviso
    : null

  return (
    <SelectComCadastroRapido
      label={p.categoria_label}
      value={ctx.categoriaId}
      onChange={ctx.setCategoriaId}
      opcoes={categorias}
      hint={avisoInativa}
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
  )
}
