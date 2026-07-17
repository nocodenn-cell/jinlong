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

