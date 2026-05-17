import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteOuDono } from '@/lib/auth/gerenteOuDono'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'

/** Resultado padronizado para server actions de cadastro (formato legado). */
export type CadastroActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Extrai erros de validação Zod e formata na língua do usuário. */
export async function zodValidationError(
  issues: Array<{ message: string }>,
): Promise<{ success: false; error: string }> {
  const { idioma } = await getUsuarioIdioma()
  return {
    success: false,
    error: mensagemErroValidacaoZod(
      issues.map((i) => i.message).join('; '),
      idioma,
    ),
  }
}

/** Alterna o campo `ativo` de uma linha em uma tabela de cadastro. */
export async function alternarAtivoCadastro(
  tabela: string,
  id: string,
  ativo: boolean,
  revalidatePaths: string[],
): Promise<CadastroActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) return { success: false, error: 'ID inválido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from(tabela)
    .update({ ativo })
    .eq('id', idParsed.data)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Alterar situação', error.message) }
  }

  for (const p of revalidatePaths) revalidatePath(p)
  return { success: true, data: null }
}

/** Exclui uma linha de uma tabela de cadastro por ID. */
export async function excluirCadastro(
  tabela: string,
  id: string,
  secaoErro: string,
  revalidatePaths: string[],
): Promise<CadastroActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) return { success: false, error: 'ID inválido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from(tabela)
    .delete()
    .eq('id', idParsed.data)

  if (error) {
    return { success: false, error: mensagemErroComSecao(secaoErro, error.message) }
  }

  for (const p of revalidatePaths) revalidatePath(p)
  return { success: true, data: null }
}

/** Insere uma linha em uma tabela de cadastro e retorna o ID. */
export async function criarCadastro(
  tabela: string,
  payload: Record<string, unknown>,
  secaoErro: string,
  revalidatePaths: string[],
): Promise<CadastroActionResult<{ id: string }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from(tabela)
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    return { success: false, error: mensagemErroComSecao(secaoErro, error.message) }
  }

  for (const p of revalidatePaths) revalidatePath(p)
  return { success: true, data: { id: (data as { id: string }).id } }
}

/** Atualiza uma linha em uma tabela de cadastro por ID. */
export async function atualizarCadastro(
  tabela: string,
  id: string,
  payload: Record<string, unknown>,
  secaoErro: string,
  revalidatePaths: string[],
): Promise<CadastroActionResult<null>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from(tabela)
    .update(payload)
    .eq('id', id)

  if (error) {
    return { success: false, error: mensagemErroComSecao(secaoErro, error.message) }
  }

  for (const p of revalidatePaths) revalidatePath(p)
  return { success: true, data: null }
}

type ListarFiltros = {
  situacao?: string
  busca?: string
  page: number
  pageSize: number
}

type ListarConfig<R> = {
  tabela: string
  selectCols: string
  secaoErro: string
  toRow: (raw: Record<string, unknown>) => R
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraFilters?: (query: any, filtros: Record<string, unknown>) => any
  postProcess?: (rows: R[], supabase: Awaited<ReturnType<typeof createClient>>) => Promise<R[]>
}

export async function listarCadastro<R, F extends ListarFiltros>(
  input: unknown,
  schema: z.ZodType<F, z.ZodTypeDef, unknown>,
  config: ListarConfig<R>,
): Promise<CadastroActionResult<{ rows: R[]; total: number }>> {
  const auth = await assertGerenteOuDono()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = schema.safeParse(input)
  if (!parsed.success) return zodValidationError((parsed as { error: z.ZodError }).error.issues)

  const filtros = parsed.data
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from(config.tabela)
    .select(config.selectCols, { count: 'exact' })

  if (filtros.situacao === 'ativos') query = query.eq('ativo', true)
  else if (filtros.situacao === 'inativos') query = query.eq('ativo', false)
  if (filtros.busca?.trim()) query = query.ilike('nome', `%${filtros.busca.trim()}%`)
  if (config.extraFilters) query = config.extraFilters(query, filtros as Record<string, unknown>)

  const from = (filtros.page - 1) * filtros.pageSize
  const to = from + filtros.pageSize - 1

  const { data, error, count } = await query.order('nome', { ascending: true }).range(from, to)

  if (error) {
    return { success: false, error: mensagemErroComSecao(config.secaoErro, (error as { message: string }).message) }
  }

  let rows = ((data ?? []) as Record<string, unknown>[]).map((r) => config.toRow(r))
  if (config.postProcess) rows = await config.postProcess(rows, supabase)
  return { success: true, data: { rows, total: (count as number | null) ?? 0 } }
}
