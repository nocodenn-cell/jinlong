import { z } from 'zod'

export const categoriaSchema = z.object({
  nome: z.string().trim().min(1, 'Nome obrigatório'),
  categoria_pai_id: z.string().uuid().optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  ativo: z.boolean().optional().default(true),
})

export type CategoriaInput = z.infer<typeof categoriaSchema>

export function categoriaValidacao(raw: unknown): { ok: true; value: CategoriaInput } | { ok: false; error: string } {
  const parsed = categoriaSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? 'Dados inválidos' }
  }
  return { ok: true, value: parsed.data }
}

