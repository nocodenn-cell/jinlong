import { z } from 'zod'

export const formaPagamentoSchema = z.object({
  codigo: z.string().trim().min(1, 'Código obrigatório'),
  descricao: z.string().trim().min(1, 'Descrição obrigatória'),
  tipo: z.enum(['CARTAO', 'DINHEIRO', 'PIX', 'BOLETO', 'OUTRO']),
  ativo: z.boolean().optional().default(true),
})

export type FormaPagamentoInput = z.infer<typeof formaPagamentoSchema>

export function formaPagamentoValidacao(raw: unknown): { ok: true; value: FormaPagamentoInput } | { ok: false; error: string } {
  const parsed = formaPagamentoSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? 'Dados inválidos' }
  }
  return { ok: true, value: parsed.data }
}

