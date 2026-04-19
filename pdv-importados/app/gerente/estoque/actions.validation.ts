import { z } from 'zod'

export const AtualizarEstoqueSchema = z.object({
  produto_id: z.string().uuid('Produto inválido.'),
  quantidade_atual: z.coerce.number().min(0, 'Quantidade atual não pode ser negativa.'),
  estoque_minimo: z.coerce.number().min(0, 'Estoque mínimo não pode ser negativo.'),
})

export const ProdutoIdSchema = z.object({
  produto_id: z.string().uuid('Produto inválido.'),
})
