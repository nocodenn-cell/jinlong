'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createClient } from '@/lib/supabase/server'
import { ROUTES } from '@shared-core/navigation/routes'
import {
  avaliarBloqueiosGo,
  calcularGateStatus,
  IMPLANTACAO_ITENS,
  itemDefByKey,
  type GateStatus,
  type ItemStatus,
} from './implantacaoCatalog'
import { coletarDadosHomologacao } from './coletarDadosHomologacao'
import {
  avaliarDadosHomologacao,
  formatarGapsHomologacao,
  type DadosHomologacaoGap,
  type DadosHomologacaoSnapshot,
} from './homologacaoDados'

export type ChecklistItemRow = {
  key: string
  status: ItemStatus
  responsavel: string | null
  concluido_em: string | null
  observacoes: string | null
  updated_at: string | null
}

export type ChecklistSnapshot = {
  lojaId: string
  goAutorizado: boolean
  goAutorizadoEm: string | null
  goAutorizadoPor: string | null
  goObservacao: string | null
  gate: GateStatus
  bloqueios: string[]
  itens: ChecklistItemRow[]
}

type ActionOk<T> = { ok: true; data: T }
type ActionErr = { ok: false; error: string }
type ActionResult<T> = ActionOk<T> | ActionErr

function fail(error: string): ActionErr {
  return { ok: false, error }
}

async function requireLoja(lojaIdOverride?: string | null) {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false as const, error: auth.error }

  const override = lojaIdOverride?.trim() || null
  if (override) {
    if (!z.string().uuid().safeParse(override).success) {
      return { ok: false as const, error: 'Identificador de loja inválido.' }
    }
    // Mesma loja da sessão: qualquer gerencial; outra loja: só ADMIN.
    if (override !== auth.session.lojaId && auth.session.perfil !== 'ADMIN') {
      return { ok: false as const, error: 'Somente ADMIN pode operar o checklist de outra loja.' }
    }
    return { ok: true as const, session: auth.session, lojaId: override }
  }

  if (!auth.session.lojaId) return { ok: false as const, error: 'Conta sem loja vinculada.' }
  return { ok: true as const, session: auth.session, lojaId: auth.session.lojaId }
}

/** Client tipado frouxo — tabelas novas até regenerar database.types. */
function db(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase as unknown as {
    from: (t: string) => ReturnType<Awaited<ReturnType<typeof createClient>>['from']>
  }
}

async function ensureChecklistRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lojaId: string,
): Promise<void> {
  const s = db(supabase)
  await s.from('implantacao_checklists').upsert(
    { loja_id: lojaId, updated_at: new Date().toISOString() },
    { onConflict: 'loja_id' },
  )

  const { data: existentes } = await s
    .from('implantacao_checklist_itens')
    .select('item_key')
    .eq('loja_id', lojaId)

  const have = new Set((existentes ?? []).map((r: { item_key: string }) => r.item_key))
  const missing = IMPLANTACAO_ITENS.filter((i) => !have.has(i.key)).map((i) => ({
    loja_id: lojaId,
    item_key: i.key,
    status: 'PENDENTE',
  }))
  if (missing.length > 0) {
    await s.from('implantacao_checklist_itens').insert(missing)
  }
}

function buildSnapshot(
  lojaId: string,
  header: {
    go_autorizado: boolean
    go_autorizado_em: string | null
    go_autorizado_por: string | null
    go_observacao: string | null
  },
  rows: Array<{
    item_key: string
    status: string
    responsavel: string | null
    concluido_em: string | null
    observacoes: string | null
    updated_at: string | null
  }>,
): ChecklistSnapshot {
  const byKey = new Map(rows.map((r) => [r.item_key, r]))
  const statusPorKey: Record<string, ItemStatus> = {}
  const itens: ChecklistItemRow[] = IMPLANTACAO_ITENS.map((def) => {
    const row = byKey.get(def.key)
    const status = (row?.status as ItemStatus) || 'PENDENTE'
    statusPorKey[def.key] = status
    return {
      key: def.key,
      status,
      responsavel: row?.responsavel ?? null,
      concluido_em: row?.concluido_em ?? null,
      observacoes: row?.observacoes ?? null,
      updated_at: row?.updated_at ?? null,
    }
  })

  const bloqueios = avaliarBloqueiosGo(statusPorKey)
  return {
    lojaId,
    goAutorizado: header.go_autorizado,
    goAutorizadoEm: header.go_autorizado_em,
    goAutorizadoPor: header.go_autorizado_por,
    goObservacao: header.go_observacao,
    gate: calcularGateStatus(header.go_autorizado, statusPorKey),
    bloqueios,
    itens,
  }
}

export async function carregarChecklistImplantacaoAction(
  lojaIdOverride?: string | null,
): Promise<ActionResult<ChecklistSnapshot>> {
  const gate = await requireLoja(lojaIdOverride)
  if (!gate.ok) return fail(gate.error)
  const lojaId = gate.lojaId

  try {
    const supabase = await createClient()
    await ensureChecklistRows(supabase, lojaId)
    const s = db(supabase)

    const { data: header, error: hErr } = await s
      .from('implantacao_checklists')
      .select('go_autorizado, go_autorizado_em, go_autorizado_por, go_observacao')
      .eq('loja_id', lojaId)
      .maybeSingle()

    if (hErr) return fail(hErr.message)

    const { data: rows, error: iErr } = await s
      .from('implantacao_checklist_itens')
      .select('item_key, status, responsavel, concluido_em, observacoes, updated_at')
      .eq('loja_id', lojaId)

    if (iErr) return fail(iErr.message)

    return {
      ok: true,
      data: buildSnapshot(
        lojaId,
        {
          go_autorizado: Boolean(header?.go_autorizado),
          go_autorizado_em: header?.go_autorizado_em ?? null,
          go_autorizado_por: header?.go_autorizado_por ?? null,
          go_observacao: header?.go_observacao ?? null,
        },
        (rows ?? []) as Array<{
          item_key: string
          status: string
          responsavel: string | null
          concluido_em: string | null
          observacoes: string | null
          updated_at: string | null
        }>,
      ),
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao carregar checklist.')
  }
}

const UpdateItemSchema = z.object({
  itemKey: z.string().min(1).max(80),
  status: z.enum(['PENDENTE', 'CONCLUIDO', 'NA']),
  responsavel: z.string().trim().max(120).nullable().optional(),
  observacoes: z.string().trim().max(2000).nullable().optional(),
})

export async function atualizarItemImplantacaoAction(input: {
  itemKey: string
  status: ItemStatus
  responsavel?: string | null
  observacoes?: string | null
  lojaId?: string | null
}): Promise<ActionResult<ChecklistSnapshot>> {
  const gate = await requireLoja(input.lojaId)
  if (!gate.ok) return fail(gate.error)
  const lojaId = gate.lojaId

  const parsed = UpdateItemSchema.safeParse(input)
  if (!parsed.success) return fail('Dados inválidos.')
  if (!itemDefByKey(parsed.data.itemKey)) return fail('Item desconhecido.')

  try {
    const supabase = await createClient()
    await ensureChecklistRows(supabase, lojaId)
    const s = db(supabase)

    const { data: headerGo } = await s
      .from('implantacao_checklists')
      .select('go_autorizado')
      .eq('loja_id', lojaId)
      .maybeSingle()

    if (headerGo?.go_autorizado) {
      return fail('Checklist bloqueado: GO-LIVE já autorizado. Revogue o GO para editar.')
    }

    const now = new Date().toISOString()
    const concluidoEm = parsed.data.status === 'CONCLUIDO' ? now : null

    const { error } = await s
      .from('implantacao_checklist_itens')
      .update({
        status: parsed.data.status,
        responsavel: parsed.data.responsavel ?? null,
        observacoes: parsed.data.observacoes ?? null,
        concluido_em: concluidoEm,
        updated_by: gate.session.userId,
        updated_at: now,
      })
      .eq('loja_id', lojaId)
      .eq('item_key', parsed.data.itemKey)

    if (error) return fail(error.message)

    await s
      .from('implantacao_checklists')
      .update({ updated_at: now })
      .eq('loja_id', lojaId)

    revalidatePath(ROUTES.admin.implantacao)
    return carregarChecklistImplantacaoAction(lojaId)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao atualizar item.')
  }
}

export async function autorizarGoLiveAction(
  observacao?: string,
  lojaIdOverride?: string | null,
): Promise<ActionResult<ChecklistSnapshot>> {
  const gate = await requireLoja(lojaIdOverride)
  if (!gate.ok) return fail(gate.error)
  if (gate.session.perfil !== 'DONO' && gate.session.perfil !== 'ADMIN') {
    return fail('Somente DONO ou ADMIN pode autorizar o GO-LIVE.')
  }

  const lojaId = gate.lojaId
  const loaded = await carregarChecklistImplantacaoAction(lojaId)
  if (!loaded.ok) return loaded
  if (loaded.data.bloqueios.length > 0) {
    return fail(
      `Não é possível autorizar GO-LIVE: ${loaded.data.bloqueios.length} item(ns) obrigatório(s) pendente(s).`,
    )
  }

  const now = new Date().toISOString()

  try {
    const supabase = await createClient()
    const s = db(supabase)
    const { error } = await s
      .from('implantacao_checklists')
      .update({
        go_autorizado: true,
        go_autorizado_em: now,
        go_autorizado_por: gate.session.userId,
        go_observacao: observacao?.trim() || null,
        updated_at: now,
      })
      .eq('loja_id', lojaId)

    if (error) return fail(error.message)

    revalidatePath(ROUTES.admin.implantacao)
    return carregarChecklistImplantacaoAction(lojaId)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao autorizar GO-LIVE.')
  }
}

export type ValidarDadosHomologacaoResult = Readonly<{
  snapshot: ChecklistSnapshot
  dados: DadosHomologacaoSnapshot
  ok: boolean
  gaps: readonly DadosHomologacaoGap[]
  resumo: string
}>

/**
 * P0-DADOS: coleta contagens da loja, avalia mínimos e marca
 * `homologacao.dados` como CONCLUIDO ou PENDENTE com observação dos gaps.
 */
export async function validarDadosHomologacaoAction(
  lojaIdOverride?: string | null,
): Promise<ActionResult<ValidarDadosHomologacaoResult>> {
  const gate = await requireLoja(lojaIdOverride)
  if (!gate.ok) return fail(gate.error)
  const lojaId = gate.lojaId

  try {
    const supabase = await createClient()
    await ensureChecklistRows(supabase, lojaId)

    const { data: headerGo } = await db(supabase)
      .from('implantacao_checklists')
      .select('go_autorizado')
      .eq('loja_id', lojaId)
      .maybeSingle()

    if (headerGo?.go_autorizado) {
      return fail('Checklist bloqueado: GO-LIVE já autorizado. Revogue o GO para editar.')
    }

    const dados = await coletarDadosHomologacao(supabase, lojaId)
    const avaliado = avaliarDadosHomologacao(dados)
    const resumo = formatarGapsHomologacao(avaliado.gaps)
    const status: ItemStatus = avaliado.ok ? 'CONCLUIDO' : 'PENDENTE'

    const updated = await atualizarItemImplantacaoAction({
      itemKey: 'homologacao.dados',
      status,
      responsavel: gate.session.userId,
      observacoes: resumo,
      lojaId,
    })
    if (!updated.ok) return fail(updated.error)

    return {
      ok: true,
      data: {
        snapshot: updated.data,
        dados,
        ok: avaliado.ok,
        gaps: avaliado.gaps,
        resumo,
      },
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao validar dados de homologação.')
  }
}

export async function revogarGoLiveAction(
  motivo: string,
  lojaIdOverride?: string | null,
): Promise<ActionResult<ChecklistSnapshot>> {
  const gate = await requireLoja(lojaIdOverride)
  if (!gate.ok) return fail(gate.error)
  if (gate.session.perfil !== 'DONO' && gate.session.perfil !== 'ADMIN') {
    return fail('Somente DONO ou ADMIN pode revogar o GO-LIVE.')
  }
  if (!motivo.trim() || motivo.trim().length < 3) {
    return fail('Informe o motivo da revogação (mín. 3 caracteres).')
  }

  const lojaId = gate.lojaId
  const now = new Date().toISOString()

  try {
    const supabase = await createClient()
    const s = db(supabase)
    const { error } = await s
      .from('implantacao_checklists')
      .update({
        go_autorizado: false,
        go_autorizado_em: null,
        go_autorizado_por: null,
        go_observacao: `Revogado: ${motivo.trim()}`,
        updated_at: now,
      })
      .eq('loja_id', lojaId)

    if (error) return fail(error.message)

    revalidatePath(ROUTES.admin.implantacao)
    return carregarChecklistImplantacaoAction(lojaId)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao revogar GO-LIVE.')
  }
}
