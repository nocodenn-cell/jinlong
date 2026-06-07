'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

export type FornecedorListRow = {
  id: string
  nome: string
  tipo: 'PF' | 'PJ'
  documento: string
  email: string | null
  telefone: string | null
  contato_pessoa: string | null
  categoria: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
  ativo: boolean
  criado_em: string | null
}

export type FornecedorInput = {
  id?: string
  nome: string
  tipo: 'PF' | 'PJ'
  documento: string
  email: string | null
  telefone: string | null
  contato_pessoa: string | null
  categoria: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
}

const PAGE_SIZE = 20

const COLUMNS = `
  id, nome, tipo, documento, email, telefone, contato_pessoa, categoria,
  endereco_logradouro, endereco_numero, endereco_complemento,
  endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
  ativo, criado_em
`

export async function buscarFornecedoresPaginadosAction(
  page: number,
  opts?: { termo?: string; status?: 'todos' | 'ativos' | 'inativos' },
): Promise<
  { ok: true; fornecedores: FornecedorListRow[]; hasMore: boolean } | { ok: false; error: string }
> {
  try {
    const supabase = await createClient()
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE

    let query = supabase
      .from('fornecedores')
      .select(COLUMNS)
      .order('nome', { ascending: true })
      .range(from, to)

    if (opts?.status === 'ativos') query = query.eq('ativo', true)
    if (opts?.status === 'inativos') query = query.eq('ativo', false)

    if (opts?.termo && opts.termo.trim()) {
      const t = opts.termo.trim()
      const onlyDigits = t.replace(/\D/g, '')
      const ors = [
        `nome.ilike.%${t}%`,
        `email.ilike.%${t}%`,
        `contato_pessoa.ilike.%${t}%`,
        `categoria.ilike.%${t}%`,
      ]
      if (onlyDigits) ors.push(`documento.like.%${onlyDigits}%`, `telefone.like.%${onlyDigits}%`)
      query = query.or(ors.join(','))
    }

    const { data, error } = await query
    if (error) return { ok: false, error: error.message }
    const rows = (data ?? []) as FornecedorListRow[]
    const hasMore = rows.length > PAGE_SIZE
    return { ok: true, fornecedores: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao buscar fornecedores.' }
  }
}

function validar(input: FornecedorInput): string | null {
  if (!input.nome || input.nome.trim().length < 2) return 'Nome inválido.'
  const docDigits = input.documento.replace(/\D/g, '')
  if (input.tipo === 'PF' && docDigits.length !== 11) return 'CPF deve ter 11 dígitos.'
  if (input.tipo === 'PJ' && docDigits.length !== 14) return 'CNPJ deve ter 14 dígitos.'
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return 'E-mail inválido.'
  if (input.endereco_cep && input.endereco_cep.replace(/\D/g, '').length !== 8)
    return 'CEP deve ter 8 dígitos.'
  return null
}

export async function salvarFornecedorAction(
  input: FornecedorInput,
): Promise<{ ok: true; fornecedor: FornecedorListRow } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  const err = validar(input)
  if (err) return { ok: false, error: err }

  try {
    const supabase = await createClient()
    const payload = {
      nome: input.nome.trim(),
      tipo: input.tipo,
      documento: input.documento.replace(/\D/g, ''),
      email: input.email?.trim() || null,
      telefone: input.telefone?.replace(/\D/g, '') || null,
      contato_pessoa: input.contato_pessoa?.trim() || null,
      categoria: input.categoria?.trim() || null,
      endereco_logradouro: input.endereco_logradouro?.trim() || null,
      endereco_numero: input.endereco_numero?.trim() || null,
      endereco_complemento: input.endereco_complemento?.trim() || null,
      endereco_bairro: input.endereco_bairro?.trim() || null,
      endereco_cidade: input.endereco_cidade?.trim() || null,
      endereco_uf: input.endereco_uf?.trim() || null,
      endereco_cep: input.endereco_cep?.replace(/\D/g, '') || null,
    }

    let query
    if (input.id) {
      query = supabase
        .from('fornecedores')
        .update(payload)
        .eq('id', input.id)
        .select(COLUMNS)
        .single()
    } else {
      query = supabase
        .from('fornecedores')
        .insert({ ...payload, ativo: true })
        .select(COLUMNS)
        .single()
    }
    const { data, error } = await query
    if (error) {
      // 23505 = unique violation (documento duplicado)
      if (error.code === '23505') {
        return { ok: false, error: 'Já existe um fornecedor com este documento.' }
      }
      return { ok: false, error: mensagemErroComSecao('Fornecedor', error.message) }
    }
    revalidatePath('/gerente/fornecedores')
    revalidateTag('catalogo-opcoes-filtro')
    return { ok: true, fornecedor: data as FornecedorListRow }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao salvar fornecedor.' }
  }
}

export async function excluirFornecedorAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()

    // Bloqueia exclusão se houver contas a pagar abertas vinculadas.
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

    const { error } = await supabase.from('fornecedores').delete().eq('id', id)
    if (error) return { ok: false, error: mensagemErroComSecao('Fornecedor', error.message) }
    revalidatePath('/gerente/fornecedores')
    revalidateTag('catalogo-opcoes-filtro')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao excluir fornecedor.' }
  }
}

/** Bulk: ativar / inativar várias linhas. */
export async function bulkAtivarFornecedoresAction(
  ids: string[],
  ativo: boolean,
): Promise<{ ok: true; afetados: number } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }
  if (ids.length === 0) return { ok: false, error: 'Nenhum fornecedor selecionado.' }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('fornecedores')
      .update({ ativo })
      .in('id', ids)
      .select('id')
    if (error) return { ok: false, error: mensagemErroComSecao('Fornecedor', error.message) }
    revalidatePath('/gerente/fornecedores')
    revalidateTag('catalogo-opcoes-filtro')
    return { ok: true, afetados: data?.length ?? 0 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao atualizar fornecedores.' }
  }
}

/** Bulk: excluir várias linhas. Mantém a regra de bloqueio por contas em aberto. */
export async function bulkExcluirFornecedoresAction(
  ids: string[],
): Promise<{ ok: true; excluidos: number; bloqueados: number } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }
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
    const { error } = await supabase.from('fornecedores').delete().in('id', liberados)
    if (error) return { ok: false, error: mensagemErroComSecao('Fornecedor', error.message) }
    revalidatePath('/gerente/fornecedores')
    revalidateTag('catalogo-opcoes-filtro')
    return { ok: true, excluidos: liberados.length, bloqueados: bloqueadosIds.size }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao excluir fornecedores.' }
  }
}
