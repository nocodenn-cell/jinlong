import { z } from 'zod'
import { revalidarDominio, type EventoDominio } from '@/lib/navigation/revalidarDominio'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import {
  mensagemErroComSecao,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/** Union of all public table names in the Supabase schema. */
type PublicTable = keyof Database['public']['Tables']

/**
 * A fully-typed Supabase client shaped against the generated Database type.
 * Used as the `supabase` parameter type in `postProcess` callbacks so callers
 * get typed query access. The factory functions (server.ts / client.ts) return
 * `SupabaseClient<any>`, which TypeScript's `any`-assignability rules make
 * compatible with this type at the call site.
 */
type TypedClient = SupabaseClient<Database>

/**
 * The filter-builder type returned by `.from(table).select(cols)` on an
 * untyped Supabase client (SupabaseClient without the Database generic).
 *
 * We derive from the bare `SupabaseClient` (which defaults to `any` generics)
 * rather than `SupabaseClient<Database>` because the typed variant resolves
 * the column-name parameter of `.eq`/`.ilike`/`.order` to the intersection of
 * column names across ALL tables — which collapses to `never` when used with a
 * union of table names. The bare client keeps column: string wide-open, which
 * is what this generic list helper needs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPublicFilterBuilder = ReturnType<ReturnType<SupabaseClient<any>['from']>['select']>

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
  tabela: PublicTable,
  id: string,
  ativo: boolean,
  eventos: readonly EventoDominio[],
): Promise<CadastroActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) return { success: false, error: 'ID inválido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from(tabela)
    // `as never`: the helper works for any public table; the typed client can't
    // statically verify that each union-table's Update type includes `ativo`.
    // Callers are responsible for using this only on tables with an `ativo` field.
    .update({ ativo } as never)
    .eq('id', idParsed.data)

  if (error) {
    return { success: false, error: mensagemErroComSecao('Alterar situação', error.message) }
  }

  revalidarDominio(eventos)
  return { success: true, data: null }
}

/** Exclui uma linha de uma tabela de cadastro por ID. */
export async function excluirCadastro(
  tabela: PublicTable,
  id: string,
  secaoErro: string,
  eventos: readonly EventoDominio[],
): Promise<CadastroActionResult<null>> {
  const auth = await assertGerenteSession()
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

  revalidarDominio(eventos)
  return { success: true, data: null }
}

/** Insere uma linha em uma tabela de cadastro e retorna o ID. */
export async function criarCadastro(
  tabela: PublicTable,
  payload: Record<string, unknown>,
  secaoErro: string,
  eventos: readonly EventoDominio[],
): Promise<CadastroActionResult<{ id: string }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from(tabela)
    // `as never`: payload is validated by Zod at the call site; the typed client
    // can't verify the shape matches the specific table's Insert type statically.
    .insert(payload as never)
    .select('id')
    .single()

  if (error) {
    return { success: false, error: mensagemErroComSecao(secaoErro, error.message) }
  }

  revalidarDominio(eventos)
  return { success: true, data: { id: (data as { id: string }).id } }
}

/** Atualiza uma linha em uma tabela de cadastro por ID. */
export async function atualizarCadastro(
  tabela: PublicTable,
  id: string,
  payload: Record<string, unknown>,
  secaoErro: string,
  eventos: readonly EventoDominio[],
): Promise<CadastroActionResult<null>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from(tabela)
    // `as never`: payload is validated by Zod at the call site.
    .update(payload as never)
    .eq('id', id)

  if (error) {
    return { success: false, error: mensagemErroComSecao(secaoErro, error.message) }
  }

  revalidarDominio(eventos)
  return { success: true, data: null }
}

type ListarFiltros = {
  situacao?: string
  busca?: string
  page: number
  pageSize: number
}

type ListarConfig<R> = {
  tabela: PublicTable
  selectCols: string
  secaoErro: string
  toRow: (raw: Record<string, unknown>) => R
  /**
   * Optional callback to apply extra filters on the query builder.
   * The builder's `.eq`, `.ilike`, `.order` methods accept `column: string`
   * so any column name is valid without additional casts in the callback.
   */
  extraFilters?: (query: AnyPublicFilterBuilder, filtros: Record<string, unknown>) => AnyPublicFilterBuilder
  postProcess?: (rows: R[], supabase: TypedClient) => Promise<R[]>
}

export async function listarCadastro<R, F extends ListarFiltros>(
  input: unknown,
  schema: z.ZodType<F, z.ZodTypeDef, unknown>,
  config: ListarConfig<R>,
): Promise<CadastroActionResult<{ rows: R[]; total: number }>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = schema.safeParse(input)
  if (!parsed.success) return zodValidationError((parsed as { error: z.ZodError }).error.issues)

  const filtros = parsed.data
  const supabase = await createClient()

  // The typed client resolves .from(union-table).select() to a filter builder
  // that carries the union of all row types.  The string overloads on .eq /
  // .ilike / .order accept any column name, so built-in filters below are safe.
  let query: AnyPublicFilterBuilder = supabase
    .from(config.tabela)
    .select(config.selectCols, { count: 'exact' }) as AnyPublicFilterBuilder

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
