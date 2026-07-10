'use server'

import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import {
  type CadastroActionResult,
  zodValidationError,
  criarCadastro,
} from '../shared/actionHelpers'

const REVALIDATE_PATHS = ['/gerente/produtos', '/admin/catalogo'] as const
const TABELA = 'marcas'

type ActionResult<T> = CadastroActionResult<T>

const NovaMarcaSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120),
})

function revalidateMarcaPaths() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p)
  revalidateTag('catalogo-opcoes-filtro')
}

export async function criarMarcaProduto(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = NovaMarcaSchema.safeParse(input)
  if (!parsed.success) return zodValidationError(parsed.error.issues)

  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const result = await criarCadastro(
    TABELA,
    { nome: parsed.data.nome.trim(), ativo: true },
    'Criar marca',
    [...REVALIDATE_PATHS],
  )
  if (result.success) revalidateMarcaPaths()
  return result
}
