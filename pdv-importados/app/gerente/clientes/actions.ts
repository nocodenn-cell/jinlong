'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ClienteListRow = {
  id: string
  nome: string
  tipo: 'PF' | 'PJ'
  documento: string
  email: string | null
  telefone: string | null
  endereco: string | null
  limite_crediario: number
  saldo_crediario: number
  ultima_compra: string | null
  criado_em: string | null
}

export type ClienteInput = {
  id?: string
  nome: string
  tipo: 'PF' | 'PJ'
  documento: string // somente dígitos
  email: string | null
  telefone: string | null // somente dígitos
  endereco: string | null
  limite_crediario: number
}

const PAGE_SIZE = 20

// ————————————————————————————————————————————————————————————
// Listagem paginada
// ————————————————————————————————————————————————————————————
export async function buscarClientesPaginadosAction(
  page: number,
  termo?: string,
): Promise<{ ok: true; clientes: ClienteListRow[]; hasMore: boolean } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE

    let query = supabase
      .from('clientes')
      .select(
        'id, nome, tipo, documento, email, telefone, endereco, limite_crediario, saldo_crediario, ultima_compra, criado_em',
      )
      .order('nome', { ascending: true })
      .range(from, to)

    if (termo && termo.trim()) {
      const t = termo.trim()
      const onlyDigits = t.replace(/\D/g, '')
      const ors = [`nome.ilike.%${t}%`, `email.ilike.%${t}%`]
      if (onlyDigits) ors.push(`documento.like.%${onlyDigits}%`, `telefone.like.%${onlyDigits}%`)
      query = query.or(ors.join(','))
    }

    const { data, error } = await query
    if (error) return { ok: false, error: error.message }

    const rows = (data ?? []) as ClienteListRow[]
    const hasMore = rows.length > PAGE_SIZE
    return { ok: true, clientes: hasMore ? rows.slice(0, PAGE_SIZE) : rows, hasMore }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao buscar clientes.' }
  }
}

// ————————————————————————————————————————————————————————————
// Criar / atualizar
// ————————————————————————————————————————————————————————————
function validar(input: ClienteInput): string | null {
  if (!input.nome || input.nome.trim().length < 2) return 'Nome inválido.'
  const docDigits = input.documento.replace(/\D/g, '')
  if (input.tipo === 'PF' && docDigits.length !== 11) return 'CPF deve ter 11 dígitos.'
  if (input.tipo === 'PJ' && docDigits.length !== 14) return 'CNPJ deve ter 14 dígitos.'
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return 'E-mail inválido.'
  if (input.limite_crediario < 0) return 'Limite não pode ser negativo.'
  return null
}

export async function salvarClienteAction(
  input: ClienteInput,
): Promise<{ ok: true; cliente: ClienteListRow } | { ok: false; error: string }> {
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
      endereco: input.endereco?.trim() || null,
      limite_crediario: input.limite_crediario,
    }

    let query
    if (input.id) {
      query = supabase
        .from('clientes')
        .update(payload)
        .eq('id', input.id)
        .select('id, nome, tipo, documento, email, telefone, endereco, limite_crediario, saldo_crediario, ultima_compra, criado_em')
        .single()
    } else {
      query = supabase
        .from('clientes')
        .insert(payload)
        .select('id, nome, tipo, documento, email, telefone, endereco, limite_crediario, saldo_crediario, ultima_compra, criado_em')
        .single()
    }
    const { data, error } = await query
    if (error) return { ok: false, error: error.message }

    revalidatePath('/gerente/clientes')
    return { ok: true, cliente: data as ClienteListRow }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao salvar cliente.' }
  }
}

// ————————————————————————————————————————————————————————————
// Exclusão — falha se o cliente tem saldo de crediário aberto
// ————————————————————————————————————————————————————————————
export async function excluirClienteAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data: existente, error: getErr } = await supabase
      .from('clientes')
      .select('saldo_crediario, nome')
      .eq('id', id)
      .maybeSingle()

    if (getErr) return { ok: false, error: getErr.message }
    if (!existente) return { ok: false, error: 'Cliente não encontrado.' }
    if (Number(existente.saldo_crediario) > 0) {
      return {
        ok: false,
        error: `Cliente "${existente.nome}" possui crediário aberto. Quite o saldo antes de excluir.`,
      }
    }

    const { error: delErr } = await supabase.from('clientes').delete().eq('id', id)
    if (delErr) return { ok: false, error: delErr.message }

    revalidatePath('/gerente/clientes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao excluir cliente.' }
  }
}
