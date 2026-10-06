/**
 * Validações Zod para ações de impressão de etiquetas.
 * Segue o padrão do projeto (ex: actions.validation.ts em estoque)
 */

import { z } from 'zod'

/** Schema para buscar produto por código de barras */
export const buscarProdutoPorCodigoSchema = z.object({
  codigo_barras: z.string().min(1, 'Código de barras é obrigatório'),
  loja_id: z.string().uuid('ID da loja inválido'),
})

/** Schema para busca textual (nome / código) na tela de etiquetas */
export const buscarProdutosParaEtiquetaSchema = z.object({
  termo: z.string().min(1, 'Informe nome ou código').max(120),
  loja_id: z.string().uuid('ID da loja inválido'),
})

/** Schema para buscar produtos por categoria */
export const buscarProdutosPorCategoriaSchema = z.object({
  categoria_id: z.string().uuid('ID da categoria inválido').optional(),
  loja_id: z.string().uuid('ID da loja inválido'),
})

/** Schema para buscar estoque atual de produtos */
export const buscarEstoqueAtualSchema = z.object({
  produto_ids: z.array(z.string().uuid()).min(1, 'Pelo menos um produto é obrigatório'),
  loja_id: z.string().uuid('ID da loja inválido'),
})

/** Schema para validar item do carrinho */
export const itemCarrinhoSchema = z.object({
  produtoId: z.string().uuid('ID do produto inválido'),
  nome: z.string().min(1, 'Nome do produto é obrigatório'),
  codigoBarras: z.string().min(1, 'Código de barras é obrigatório'),
  precoVarejo: z.number().positive('Preço deve ser positivo'),
  quantidade: z.number().int().positive('Quantidade deve ser positiva'),
  atributo: z.string().optional(),
})

/** Schema para validar lista de itens do carrinho */
export const carrinhoSchema = z.array(itemCarrinhoSchema).max(500, 'Máximo de 500 itens por PDF')
