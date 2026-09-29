'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'
import {
  FORNECEDOR_SELECT_COLUMNS,
  lojaIdDaSessao,
  normalizarCnpj,
  validarFornecedorInput,
  type FornecedorInput,
  type FornecedorListRow,
} from './fornecedorContrato'

export type { FornecedorInput, FornecedorListRow }

const PAGE_SIZE = 20

/**
 * Regra de negócio explícita para exclusão bloqueada por vínculo (constraint de
 * FK — ex.: produtos ou contas a pagar já quitadas/canceladas referenciando o
 * fornecedor). Antes disso, o erro cru do Postgres (23503) vazava ao usuário.
 */
const MSG_FORNECEDOR_VINCULADO =
  'Fornecedor possui produtos ou compras vinculadas e não pode ser excluído.'

function asListRow(raw: unknown): FornecedorListRow {
  const r = raw as FornecedorListRow
  return {
    id: r.id,
    cnpj: r.cnpj,
    nome: r.nome,
    loja_id: r.loja_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

async function buscarPorLojaCnpj(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lojaId: string,
  cnpj: string,
): Promise<FornecedorListRow | null> {
  const { data, error } = await supabase
    .from('fornecedores')
    .select(FORNECEDOR_SELECT_COLUMNS)
    .eq('loja_id', lojaId)
    .eq('cnpj', cnpj)
    .maybeSingle()
  if (error || !data) return null
  return asListRow(data)
}

function revalidarFornecedores(): void {
  revalidatePath('/gerente/fornecedores')
  revalidatePath('/admin/fornecedores')
  revalidateTag('catalogo-opcoes-filtro')
}

export async function buscarFornecedoresPaginadosAction(
  page: number,
  opts?: { termo?: string },
): Promise<
  { ok: true; fornecedores: FornecedorListRow[]; hasMore: boolean } | { ok: false; error: string }
> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const tenant = lojaIdDaSessao(auth.session)
  if (!tenant.ok) return tenant

  try {
    const supabase = await createClient()
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE

    let query = supabase
      .from('fornecedores')
      .select(FORNECEDOR_SELECT_COLUMNS)
      .eq('loja_id', tenant.lojaId)

    if (opts?.termo && opts.termo.trim()) {
      const t = opts.termo.trim()
      const onlyDigits = normalizarCnpj(t)
      const ors = [`nome.ilike.%${t}%`]
      if (onlyDigits) ors.push(`cnpj.like.%${onlyDigits}%`)
      query = query.or(ors.join(','))
    }

    const { data, error } = await query
      .order('nome', { ascending: true })
      .range(from, to)
    if (error) return { ok: false, error: error.message }
    const rows = (data ?? []).map(asListRow)
    const hasMore = rows.length > PAGE_SIZE
    return { ok: true, fornecedores: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao buscar fornecedores.' }
  }
}

export async function salvarFornecedorAction(
  input: FornecedorInput,
): Promise<{ ok: true; fornecedor: FornecedorListRow } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const tenant = lojaIdDaSessao(auth.session)
  if (!tenant.ok) return tenant

  const err = validarFornecedorInput(input)
  if (err) return { ok: false, error: err }

  const nome = input.nome.trim()
  const cnpj = normalizarCnpj(input.cnpj)

  try {
    const supabase = await createClient()

    if (input.id) {
      const { data, error } = await supabase
        .from('fornecedores')
        .update({ nome, cnpj })
        .eq('id', input.id)
        .eq('loja_id', tenant.lojaId)
        .select(FORNECEDOR_SELECT_COLUMNS)
        .maybeSingle()
      if (error) {
        if (error.code === '23505') {
          return { ok: false, error: 'Já existe um fornecedor com este CNPJ nesta loja.' }
        }
        return { ok: false, error: mensagemErroComSecao('Fornecedor', error.message) }
      }
      if (!data) return { ok: false, error: 'Fornecedor não encontrado.' }
      revalidarFornecedores()
      return { ok: true, fornecedor: asListRow(data) }
    }

    const { data, error } = await supabase
      .from('fornecedores')
      .insert({ nome, cnpj, loja_id: tenant.lojaId })
      .select(FORNECEDOR_SELECT_COLUMNS)
      .single()

    if (error) {
      if (error.code === '23505') {
        const existente = await buscarPorLojaCnpj(supabase, tenant.lojaId, cnpj)
        if (existente) {
          revalidarFornecedores()
          return { ok: true, fornecedor: existente }
        }
        return { ok: false, error: 'Já existe um fornecedor com este CNPJ nesta loja.' }
      }
      return { ok: false, error: mensagemErroComSecao('Fornecedor', error.message) }
    }

    revalidarFornecedores()
    return { ok: true, fornecedor: asListRow(data) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao salvar fornecedor.' }
  }
}

export async function excluirFornecedorAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const tenant = lojaIdDaSessao(auth.session)
  if (!tenant.ok) return tenant

  try {
    const supabase = await createClient()

    const { count, error: countErr } = await supabase
      .from('contas_pagar')
      .select('id', { count: 'exact', head: true })
      .eq('fornecedor_id', id)
      .in('status', ['PENDENTE', 'PARCIAL'])
    if (countErr) return { ok: false, error: countErr.message }
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `Fornecedor possui ${count} conta(s) a pagar em aberto. Quite ou cancele antes de excluir.`,
      }
    }

    const { data, error } = await supabase
      .from('fornecedores')
      .delete()
      .eq('id', id)
      .eq('loja_id', tenant.lojaId)
      .select('id')
    if (error) {
      if (error.code === '23503') return { ok: false, error: MSG_FORNECEDOR_VINCULADO }
      return { ok: false, error: mensagemErroComSecao('Fornecedor', error.message) }
    }
    if (!data?.length) return { ok: false, error: 'Fornecedor não encontrado.' }
    revalidarFornecedores()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao excluir fornecedor.' }
  }
}

/** Bulk: excluir várias linhas. Mantém bloqueio por contas em aberto. */
export async function bulkExcluirFornecedoresAction(
  ids: string[],
): Promise<{ ok: true; excluidos: number; bloqueados: number } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const tenant = lojaIdDaSessao(auth.session)
  if (!tenant.ok) return tenant

  if (ids.length === 0) return { ok: false, error: 'Nenhum fornecedor selecionado.' }

  try {
    const supabase = await createClient()
    const { data: blocked } = await supabase
      .from('contas_pagar')
      .select('fornecedor_id')
      .in('fornecedor_id', ids)
      .in('status', ['PENDENTE', 'PARCIAL'])
    const bloqueadosIds = new Set((blocked ?? []).map((r) => r.fornecedor_id as string))
    const liberados = ids.filter((id) => !bloqueadosIds.has(id))

    if (liberados.length === 0) {
      return { ok: true, excluidos: 0, bloqueados: ids.length }
    }
    const { data, error } = await supabase
      .from('fornecedores')
      .delete()
      .in('id', liberados)
      .eq('loja_id', tenant.lojaId)
      .select('id')
    if (error) {
      if (error.code === '23503') return { ok: false, error: MSG_FORNECEDOR_VINCULADO }
      return { ok: false, error: mensagemErroComSecao('Fornecedor', error.message) }
    }
    revalidarFornecedores()
    return { ok: true, excluidos: data?.length ?? 0, bloqueados: bloqueadosIds.size }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao excluir fornecedores.' }
  }
}
