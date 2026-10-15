'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createAdminClient } from '@/lib/supabase/admin'
import { PASSWORD_MIN_LENGTH, validateNewPassword } from '@/lib/auth/passwordPolicy'
import { ROUTES } from '@/lib/navigation/routes'
import { IMPLANTACAO_ITENS } from '../implantacao/implantacaoCatalog'
import {
  CHECKLIST_ITENS_POS_PROVISION,
  linhasFormasPagamentoPadrao,
  PDV_CONFIG_DEFAULTS,
  slugCodigoLoja,
} from './provisionamentoDefaults'
import { getDonoReuseError } from './provisionamentoPolicies'

export type ActionOk<T> = { ok: true; data: T }
export type ActionErr = { ok: false; error: string }
export type ActionResult<T> = ActionOk<T> | ActionErr

export type ProvisionamentoResult = {
  lojaId: string
  lojaNome: string
  lojaCodigo: string | null
  lojaNova: boolean
  donoId: string
  donoEmail: string
  donoNovo: boolean
  configInicializada: boolean
  checklistPronto: boolean
  itensMarcados: string[]
  validacao: {
    lojaOk: boolean
    donoOk: boolean
    configOk: boolean
    checklistOk: boolean
  }
  implantacaoHref: string
}

function fail(error: string): ActionErr {
  return { ok: false, error }
}

type AdminClient = ReturnType<typeof createAdminClient>

type LooseRow = Record<string, unknown>
type LooseResult<T> = Promise<{ data: T; error: { message: string } | null }>

/** Query builder mínimo — database.types está desatualizado para lojas/pdv/checklist. */
type LooseQuery = {
  select: (cols: string) => LooseQuery
  insert: (row: LooseRow | LooseRow[]) => LooseQuery
  update: (row: LooseRow) => LooseQuery
  upsert: (row: LooseRow | LooseRow[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => LooseQuery
  eq: (col: string, val: unknown) => LooseQuery
  maybeSingle: () => LooseResult<LooseRow | null>
  single: () => LooseResult<LooseRow>
  then: Promise<{ data: LooseRow[] | null; error: { message: string } | null }>['then']
}

function fromLoose(admin: AdminClient, table: string): LooseQuery {
  return (admin as unknown as { from: (t: string) => LooseQuery }).from(table)
}

async function requireAdminSession() {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  if (auth.session.perfil !== 'ADMIN') {
    return { ok: false as const, error: 'Somente a equipe FastProduct (ADMIN) pode provisionar lojas.' }
  }
  return { ok: true as const, session: auth.session }
}

const ProvisionSchema = z.object({
  lojaNome: z.string().trim().min(2).max(120),
  lojaCodigo: z
    .string()
    .trim()
    .max(32)
    .regex(/^[A-Za-z0-9_-]*$/, 'Código inválido')
    .optional()
    .nullable(),
  donoNome: z.string().trim().min(2).max(120),
  donoEmail: z.string().trim().email().max(254),
  donoSenha: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  idiomaPreferido: z.enum(['pt', 'zh']),
})

async function findAuthUserByEmail(admin: AdminClient, email: string) {
  const target = email.toLowerCase()
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) break
  }
  return null
}

async function ensureLoja(
  admin: AdminClient,
  nome: string,
  codigoInput: string | null | undefined,
): Promise<{ lojaId: string; nome: string; codigo: string | null; nova: boolean }> {
  const codigo = (codigoInput?.trim() || slugCodigoLoja(nome)).toUpperCase()

  const { data: porCodigo } = await fromLoose(admin, 'lojas')
    .select('id, nome, codigo')
    .eq('codigo', codigo)
    .maybeSingle()

  if (porCodigo) {
    return {
      lojaId: String(porCodigo.id),
      nome: String(porCodigo.nome),
      codigo: (porCodigo.codigo as string | null) ?? codigo,
      nova: false,
    }
  }

  const { data: inserted, error } = await fromLoose(admin, 'lojas')
    .insert({ nome, codigo, ativo: true })
    .select('id, nome, codigo')
    .single()

  if (error) {
    if (/duplicate|unique|already/i.test(error.message)) {
      const { data: again } = await fromLoose(admin, 'lojas')
        .select('id, nome, codigo')
        .eq('codigo', codigo)
        .maybeSingle()
      if (again) {
        return {
          lojaId: String(again.id),
          nome: String(again.nome),
          codigo: (again.codigo as string | null) ?? codigo,
          nova: false,
        }
      }
    }
    throw new Error(error.message)
  }

  return {
    lojaId: String(inserted.id),
    nome: String(inserted.nome),
    codigo: (inserted.codigo as string | null) ?? codigo,
    nova: true,
  }
}

async function ensureDono(input: {
  admin: AdminClient
  lojaId: string
  nome: string
  email: string
  senha: string
  idioma: 'pt' | 'zh'
}): Promise<{ donoId: string; novo: boolean }> {
  const { admin, lojaId, nome, email, senha, idioma } = input
  const emailNorm = email.toLowerCase()

  const existingAuth = await findAuthUserByEmail(admin, emailNorm)
  if (existingAuth) {
    const { data: row } = await fromLoose(admin, 'usuarios')
      .select('id, perfil, loja_id, ativo')
      .eq('id', existingAuth.id)
      .maybeSingle()

    if (row) {
      const rowLoja = row.loja_id as string | null
      const rowPerfil = String(row.perfil)
      if (rowLoja && rowLoja !== lojaId) {
        throw new Error('Este e-mail já está vinculado a outra loja.')
      }
      const reuseError = getDonoReuseError(rowPerfil)
      if (reuseError) throw new Error(reuseError)
      if (rowLoja !== lojaId || rowPerfil !== 'DONO') {
        const { error: updErr } = await fromLoose(admin, 'usuarios')
          .update({
            nome,
            perfil: 'DONO',
            idioma_preferido: idioma,
            loja_id: lojaId,
            ativo: true,
          })
          .eq('id', existingAuth.id)
        if (updErr) throw new Error(updErr.message)
      }
      return { donoId: existingAuth.id, novo: false }
    }

    const { error: insErr } = await fromLoose(admin, 'usuarios').insert({
      id: existingAuth.id,
      nome,
      perfil: 'DONO',
      idioma_preferido: idioma,
      loja_id: lojaId,
      ativo: true,
    })
    if (insErr) throw new Error(insErr.message)
    return { donoId: existingAuth.id, novo: false }
  }

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: emailNorm,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: nome },
  })

  if (authErr || !created.user) {
    const msg = authErr?.message ?? 'Falha ao criar usuário no Auth.'
    if (/already|registered|exists|duplicate/i.test(msg)) {
      const again = await findAuthUserByEmail(admin, emailNorm)
      if (again) {
        return ensureDono({ ...input, email: emailNorm })
      }
    }
    throw new Error(msg)
  }

  const userId = created.user.id
  try {
    const { error: dbErr } = await fromLoose(admin, 'usuarios').insert({
      id: userId,
      nome,
      perfil: 'DONO',
      idioma_preferido: idioma,
      loja_id: lojaId,
      ativo: true,
    })
    if (dbErr) {
      await admin.auth.admin.deleteUser(userId)
      throw new Error(dbErr.message)
    }
    return { donoId: userId, novo: true }
  } catch (e) {
    try {
      await admin.auth.admin.deleteUser(userId)
    } catch {
      // compensação best-effort
    }
    throw e
  }
}

async function nextPdvConfigId(admin: AdminClient): Promise<number> {
  const { data, error } = await fromLoose(admin, 'pdv_config').select('id')
  if (error) throw new Error(error.message)
  const max = (data ?? []).reduce((acc, row) => Math.max(acc, Number(row.id) || 0), 0)
  return max + 1
}

async function ensurePdvConfig(admin: AdminClient, lojaId: string, donoId: string, idioma: 'pt' | 'zh') {
  const defaults = {
    loja_id: lojaId,
    gerente_id: donoId,
    ...PDV_CONFIG_DEFAULTS,
    idioma_padrao: idioma,
    // `gerente_senha_sha256` é NOT NULL (005_mvp_pdv_config.sql) mas está
    // LEGADO desde a migração para bcrypt (067_pdv_config_bcrypt_gerente.sql)
    // — nenhum código de runtime (web ou pdv-local, que sempre grava '' no
    // seu cache local) lê este valor para autenticar. Sem preenchê-lo aqui,
    // todo provisionamento de loja nova quebra com "violates not-null
    // constraint" — comprovado via smoke-fase1-provisionamento-homologacao.
    gerente_senha_sha256: '',
  }

  const { data: existing } = await fromLoose(admin, 'pdv_config')
    .select('id, loja_id')
    .eq('loja_id', lojaId)
    .maybeSingle()

  if (existing) {
    const { error } = await fromLoose(admin, 'pdv_config')
      .update({
        cfop_padrao: PDV_CONFIG_DEFAULTS.cfop_padrao,
        cst_padrao: PDV_CONFIG_DEFAULTS.cst_padrao,
        regime_tributario: PDV_CONFIG_DEFAULTS.regime_tributario,
        idioma_padrao: idioma,
        gerente_id: donoId,
      })
      .eq('loja_id', lojaId)
    if (error) throw new Error(error.message)
    return
  }

  // `pdv_config.id` tem DEFAULT 1 (legado MVP) — insert sem id colide no PK.
  const id = await nextPdvConfigId(admin)
  const { error } = await fromLoose(admin, 'pdv_config').insert({ id, ...defaults })
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return
    throw new Error(error.message)
  }
}

/**
 * Garante as formas de pagamento padrão da loja (idempotente). `ignoreDuplicates`
 * preserva o que a loja já configurou (ex.: forma desativada) num reprovisionamento.
 */
async function ensureFormasPagamento(admin: AdminClient, lojaId: string) {
  const { error } = await fromLoose(admin, 'formas_pagamento').upsert(
    linhasFormasPagamentoPadrao(lojaId),
    { onConflict: 'loja_id,codigo', ignoreDuplicates: true },
  )
  if (error) throw new Error(error.message)
}

async function ensureChecklistBootstrap(admin: AdminClient, lojaId: string, atorId: string) {
  const now = new Date().toISOString()

  const { error: upsertErr } = await fromLoose(admin, 'implantacao_checklists').upsert(
    { loja_id: lojaId, updated_at: now },
    { onConflict: 'loja_id' },
  )
  if (upsertErr) throw new Error(upsertErr.message)

  const { data: existentesList, error: listErr } = await fromLoose(admin, 'implantacao_checklist_itens')
    .select('item_key')
    .eq('loja_id', lojaId)
  if (listErr) throw new Error(listErr.message)

  const have = new Set((existentesList ?? []).map((r) => String(r.item_key)))
  const missing = IMPLANTACAO_ITENS.filter((i) => !have.has(i.key)).map((i) => ({
    loja_id: lojaId,
    item_key: i.key,
    status: 'PENDENTE',
  }))
  if (missing.length > 0) {
    const { error } = await fromLoose(admin, 'implantacao_checklist_itens').insert(missing)
    if (error) throw new Error(error.message)
  }

  const marcados: string[] = []
  for (const key of CHECKLIST_ITENS_POS_PROVISION) {
    const { error } = await fromLoose(admin, 'implantacao_checklist_itens')
      .update({
        status: 'CONCLUIDO',
        responsavel: 'provisionamento',
        concluido_em: now,
        observacoes: 'Marcado automaticamente pelo wizard de provisionamento.',
        updated_by: atorId,
        updated_at: now,
      })
      .eq('loja_id', lojaId)
      .eq('item_key', key)
    if (!error) marcados.push(key)
  }
  return marcados
}

async function validarProvisionamento(
  admin: AdminClient,
  lojaId: string,
  donoId: string,
): Promise<ProvisionamentoResult['validacao']> {
  const { data: loja } = await fromLoose(admin, 'lojas').select('id').eq('id', lojaId).maybeSingle()
  const { data: dono } = await fromLoose(admin, 'usuarios')
    .select('id, perfil, loja_id, ativo')
    .eq('id', donoId)
    .maybeSingle()
  const { data: cfg } = await fromLoose(admin, 'pdv_config')
    .select('loja_id')
    .eq('loja_id', lojaId)
    .maybeSingle()
  // Só formas ATIVAS contam: a RPC de venda exige `ativo = true`, e o upsert
  // preserva formas que a loja já desativou num reprovisionamento.
  const { data: formasList } = await fromLoose(admin, 'formas_pagamento')
    .select('codigo')
    .eq('loja_id', lojaId)
    .eq('ativo', true)
  const { data: itensList } = await fromLoose(admin, 'implantacao_checklist_itens')
    .select('item_key')
    .eq('loja_id', lojaId)

  const donoOk = Boolean(
    dono &&
      dono.perfil === 'DONO' &&
      dono.loja_id === lojaId &&
      dono.ativo !== false,
  )

  return {
    lojaOk: Boolean(loja),
    donoOk,
    // Sem forma de pagamento ativa a loja não consegue vender: config incompleta.
    configOk: Boolean(cfg) && (formasList?.length ?? 0) > 0,
    checklistOk: (itensList?.length ?? 0) >= IMPLANTACAO_ITENS.length,
  }
}

/**
 * Provisiona loja + DONO + config PDV + checklist (idempotente).
 * Service Role somente neste módulo (server). Sem Admin API no browser.
 */
export async function provisionarLojaAction(input: {
  lojaNome: string
  lojaCodigo?: string | null
  donoNome: string
  donoEmail: string
  donoSenha: string
  idiomaPreferido: 'pt' | 'zh'
}): Promise<ActionResult<ProvisionamentoResult>> {
  const gate = await requireAdminSession()
  if (!gate.ok) return fail(gate.error)

  const parsed = ProvisionSchema.safeParse(input)
  if (!parsed.success) return fail('Dados inválidos. Verifique nome da loja, e-mail e senha do DONO.')

  const senhaCheck = validateNewPassword(parsed.data.donoSenha, parsed.data.donoSenha)
  if (!senhaCheck.ok) {
    return fail(`A senha do DONO deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  }

  const email = parsed.data.donoEmail.toLowerCase()
  if (/@(localhost\.test|example\.com|exemplo\.com)$/i.test(email)) {
    return fail('Use um e-mail real do cliente (não use domínios de teste).')
  }

  let createdAuthUserId: string | null = null

  try {
    const admin = createAdminClient()

    const loja = await ensureLoja(admin, parsed.data.lojaNome, parsed.data.lojaCodigo)

    const beforeAuth = await findAuthUserByEmail(admin, email)
    const dono = await ensureDono({
      admin,
      lojaId: loja.lojaId,
      nome: parsed.data.donoNome,
      email,
      senha: parsed.data.donoSenha,
      idioma: parsed.data.idiomaPreferido,
    })
    if (dono.novo && !beforeAuth) createdAuthUserId = dono.donoId

    await ensurePdvConfig(admin, loja.lojaId, dono.donoId, parsed.data.idiomaPreferido)
    await ensureFormasPagamento(admin, loja.lojaId)
    const itensMarcados = await ensureChecklistBootstrap(admin, loja.lojaId, gate.session.userId)
    const validacao = await validarProvisionamento(admin, loja.lojaId, dono.donoId)

    if (!validacao.lojaOk || !validacao.donoOk || !validacao.configOk || !validacao.checklistOk) {
      return fail(
        `Provisionamento incompleto: loja=${validacao.lojaOk} dono=${validacao.donoOk} config=${validacao.configOk} checklist=${validacao.checklistOk}`,
      )
    }

    const implantacaoHref = `${ROUTES.admin.implantacao}?lojaId=${encodeURIComponent(loja.lojaId)}`

    revalidatePath(ROUTES.admin.provisionamento)
    revalidatePath(ROUTES.admin.implantacao)

    return {
      ok: true,
      data: {
        lojaId: loja.lojaId,
        lojaNome: loja.nome,
        lojaCodigo: loja.codigo,
        lojaNova: loja.nova,
        donoId: dono.donoId,
        donoEmail: email,
        donoNovo: dono.novo,
        configInicializada: true,
        checklistPronto: true,
        itensMarcados,
        validacao,
        implantacaoHref,
      },
    }
  } catch (e) {
    if (createdAuthUserId) {
      try {
        const admin = createAdminClient()
        await admin.auth.admin.deleteUser(createdAuthUserId)
      } catch {
        // best-effort
      }
    }
    return fail(e instanceof Error ? e.message : 'Erro ao provisionar loja.')
  }
}
