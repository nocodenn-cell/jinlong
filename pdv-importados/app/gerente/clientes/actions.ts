'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'

export type ClienteListRow = {
  id: string
  nome: string
  tipo: 'PF' | 'PJ'
  documento: string
  email: string | null
  telefone: string | null
  endereco: string | null
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
  // Consentimento LGPD — preenchidos apenas na criação de novo cliente
  termos_aceitos_em?: string | null
  consentimento_privacidade_em?: string | null
}

const PAGE_SIZE = 20

// Colunas expostas pela view v_clientes_gerente.
// Nota: limite_credito e saldo_crediario removidos em migration 267 (fiado desabilitado).
// `ultima_compra` é NULL até a Fase 7 (vendas ainda não possui cliente_id).
const VIEW_COLS = 'id, nome, tipo, documento, email, telefone, endereco, ultima_compra, created_at'

type ClienteViewRow = {
  id: string
  nome: string
  tipo: 'PF' | 'PJ'
  documento: string
  email: string | null
  telefone: string | null
  endereco: string | null
  ultima_compra: string | null
  created_at: string | null
}

/** Converte a linha da view (colunas reais do banco) para o contrato de UI. */
function mapClienteRow(r: ClienteViewRow): ClienteListRow {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    documento: r.documento,
    email: r.email,
    telefone: r.telefone,
    endereco: r.endereco,
    ultima_compra: r.ultima_compra ?? null,
    criado_em: r.created_at ?? null,
  }
}

// ————————————————————————————————————————————————————————————
// Listagem paginada
// ————————————————————————————————————————————————————————————
export async function buscarClientesPaginadosAction(
  page: number,
  termo?: string,
): Promise<{ ok: true; clientes: ClienteListRow[]; hasMore: boolean } | { ok: false; error: string }> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  try {
    const supabase = await createClient()
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE

    let query = supabase
      .from('v_clientes_gerente')
      .select(VIEW_COLS)
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

    const rows = ((data ?? []) as ClienteViewRow[]).map(mapClienteRow)
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
  return null
}

export async function salvarClienteAction(
  input: ClienteInput,
): Promise<{ ok: true; cliente: ClienteListRow } | { ok: false; error: string }> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  const err = validar(input)
  if (err) return { ok: false, error: err }

  try {
    const supabase = await createClient()
    // Payload de cliente: sem limite_credito (fiado removido em migration 267).
    // `tipo`/`endereco` são colunas adicionadas em migration 244.
    const basePayload = {
      nome: input.nome.trim(),
      tipo: input.tipo,
      documento: input.documento.replace(/\D/g, ''),
      email: input.email?.trim() || null,
      telefone: input.telefone?.replace(/\D/g, '') || null,
      endereco: input.endereco?.trim() || null,
    }

    let id = input.id
    if (id) {
      const { error } = await supabase.from('clientes').update(basePayload).eq('id', id)
      if (error) return { ok: false, error: error.message }
    } else {
      // `clientes.loja_id` é NOT NULL (migration 112): preenche com a loja do gerente.
      const lojaId = authCheck.session.lojaId
      if (!lojaId) {
        return { ok: false, error: 'Sua conta não está associada a uma loja. Contate o administrador.' }
      }
      const insertPayload = {
        ...basePayload,
        loja_id: lojaId,
        // Consentimento LGPD — registrado apenas na criação de novo cliente
        ...(input.termos_aceitos_em
          ? {
              termos_aceitos_em: input.termos_aceitos_em,
              consentimento_privacidade_em: input.consentimento_privacidade_em ?? null,
            }
          : {}),
      }
      const { data, error } = await supabase
        .from('clientes')
        .insert(insertPayload)
        .select('id')
        .single()
      if (error) return { ok: false, error: error.message }
      id = data.id
    }

    // Relê pela view para devolver os campos computados (saldo_crediario) coerentes.
    const { data: row, error: readErr } = await supabase
      .from('v_clientes_gerente')
      .select(VIEW_COLS)
      .eq('id', id)
      .single()
    if (readErr) return { ok: false, error: readErr.message }

    revalidatePath('/gerente/clientes')
    return { ok: true, cliente: mapClienteRow(row as ClienteViewRow) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao salvar cliente.' }
  }
}

// ————————————————————————————————————————————————————————————
// Exclusão com conformidade LGPD (Art. 16)
//
// Regras:
//  1. Saldo de crediário aberto → rejeita (não pode excluir).
//  2. Possui histórico em contas_receber → anonimiza os campos
//     de dados pessoais (nome, documento, telefone, email,
//     endereco) e marca ativo = false. Os registros contábeis
//     são preservados para fins de auditoria fiscal.
//  3. Sem histórico → deleção física.
// ————————————————————————————————————————————————————————————
export async function excluirClienteAction(
  id: string,
): Promise<{ ok: true; anonimizado?: boolean } | { ok: false; error: string }> {
  const authCheck = await assertGerenteSession()
  if (!authCheck.ok) return { ok: false, error: authCheck.error }

  try {
    const supabase = await createClient()

    // Verificar que cliente existe
    const { data: existente, error: getErr } = await supabase
      .from('v_clientes_gerente')
      .select('id, nome')
      .eq('id', id)
      .maybeSingle()

    if (getErr) return { ok: false, error: getErr.message }
    if (!existente) return { ok: false, error: 'Cliente não encontrado.' }

    // Remoção física: contas_receber está desabilitada (fiado removido em migration 267)
    const { error: delErr } = await supabase.from('clientes').delete().eq('id', id)
    if (delErr) return { ok: false, error: delErr.message }

    revalidatePath('/gerente/clientes')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao excluir cliente.' }
  }
}
