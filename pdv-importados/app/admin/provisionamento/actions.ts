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
import {
  gerarCodigoAtivacao,
  hashCodigoAtivacao,
  mensagemErroProvisionamento,
  montarPayloadRpc,
  validarEntradaProvisionamento,
  type PapelEquipe,
  type ProvisionEmpresaInput,
} from './provisionamentoEmpresa'

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

type GateProvisionamento =
  | { ok: false; error: string }
  | { ok: true; session: Extract<Awaited<ReturnType<typeof assertGerenteSession>>, { ok: true }>['session'] }

async function requireAdminSession(): Promise<GateProvisionamento> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  // Perfil ADMIN removido do app das lojas: o provisionamento fica fechado aqui (falha fechada) e
  // passa a ser feito pela equipe da plataforma fora do sistema operacional das lojas.
  return { ok: false as const, error: 'O provisionamento de lojas não está disponível no app das lojas.' }
}

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

async function nextPdvConfigId(admin: AdminClient): Promise<number> {
  const { data, error } = await fromLoose(admin, 'pdv_config').select('id')
  if (error) throw new Error(error.message)
  const max = (data ?? []).reduce((acc, row) => Math.max(acc, Number(row.id) || 0), 0)
  return max + 1
}

/**
 * Multiempresa (fase 3): a linha padrão da empresa (pdv_config.loja_id NULL, semeada pelo banco)
 * é a que o validar-gerente lê. Aponta o dono como gerente. Coluna/linha ausente ⇒ ignora (pré-fase 3).
 */
async function apontarGerentePadraoEmpresa(admin: AdminClient, lojaId: string, donoId: string) {
  const { data: loja } = await fromLoose(admin, 'lojas').select('empresa_id').eq('id', lojaId).maybeSingle()
  const empresaId = (loja as { empresa_id?: string } | null)?.empresa_id
  if (!empresaId) return
  await fromLoose(admin, 'pdv_config')
    .update({ gerente_id: donoId })
    .eq('empresa_id', empresaId)
    .eq('gerente_id', `empresa-${empresaId.slice(0, 8)}`) // só a linha semeada (loja_id NULL)
}

async function ensurePdvConfig(admin: AdminClient, lojaId: string, donoId: string, idioma: 'pt' | 'zh') {
  await apontarGerentePadraoEmpresa(admin, lojaId, donoId).catch(() => undefined)
  const defaults = {
    loja_id: lojaId,
    gerente_id: donoId,
    ...PDV_CONFIG_DEFAULTS,
    idioma_padrao: idioma,
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
 * Usuário do Auth para uma pessoa da equipe: reaproveita se o e-mail já existe
 * (a RPC recusa quem pertence a outra empresa ou é ADMIN), senão cria.
 */
async function ensureAuthUser(
  admin: AdminClient,
  p: { nome: string; email: string; senha: string },
): Promise<{ id: string; novo: boolean }> {
  const email = p.email.trim().toLowerCase()
  const existing = await findAuthUserByEmail(admin, email)
  if (existing) return { id: existing.id, novo: false }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: p.senha,
    email_confirm: true,
    user_metadata: { full_name: p.nome.trim() },
  })
  if (error || !data.user) {
    const msg = error?.message ?? 'Falha ao criar usuário no Auth.'
    if (/already|registered|exists|duplicate/i.test(msg)) {
      const again = await findAuthUserByEmail(admin, email)
      if (again) return { id: again.id, novo: false }
    }
    throw new Error(msg)
  }
  return { id: data.user.id, novo: true }
}

const EmpresaSchema = z.object({
  empresaNome: z.string().trim().min(2).max(120),
  empresaCnpj: z.string().trim().max(18).optional().nullable(),
  lojas: z
    .array(
      z.object({
        nome: z.string().trim().min(2).max(120),
        codigo: z.string().trim().max(32).regex(/^[A-Za-z0-9_-]*$/, 'Código inválido').optional().nullable(),
      }),
    )
    .min(1)
    .max(20),
  dono: z.object({
    nome: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    senha: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  }),
  equipe: z
    .array(
      z.object({
        nome: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(254),
        senha: z.string().min(PASSWORD_MIN_LENGTH).max(128),
        papel: z.enum(['GERENTE', 'OPERADOR']),
        lojas: z.array(z.number().int().min(0)).min(1),
      }),
    )
    .max(50)
    .default([]),
  idiomaPreferido: z.enum(['pt', 'zh']),
})

export type ProvisionamentoEmpresaResult = ProvisionamentoResult & {
  empresaId: string
  lojas: { id: string; nome: string }[]
  equipe: { email: string; papel: PapelEquipe; novo: boolean }[]
}

/**
 * Provisiona EMPRESA + lojas + DONO + equipe (GERENTE/OPERADOR) sem SQL manual.
 * 1) cria/reaproveita usuários no Auth (Admin API, só no servidor);
 * 2) empresa, lojas, usuarios e vínculos numa ÚNICA transação (RPC plataforma_provisionar_empresa);
 * 3) config PDV, formas de pagamento e checklist por loja (idempotentes).
 * Falha em (2) ⇒ nada fica no banco e os usuários do Auth criados agora são apagados.
 */
export async function provisionarEmpresaAction(
  input: ProvisionEmpresaInput,
): Promise<ActionResult<ProvisionamentoEmpresaResult>> {
  const gate = await requireAdminSession()
  if (!gate.ok) return fail(gate.error)

  const parsed = EmpresaSchema.safeParse(input)
  if (!parsed.success) return fail('Dados inválidos. Verifique empresa, lojas, e-mails e senhas.')
  const data: ProvisionEmpresaInput = {
    ...(parsed.data as ProvisionEmpresaInput),
    lojas: parsed.data.lojas.map((l) => ({ nome: l.nome, codigo: l.codigo?.trim() || slugCodigoLoja(l.nome) })),
  }
  const regra = validarEntradaProvisionamento(data, PASSWORD_MIN_LENGTH)
  if (regra) return fail(regra)
  for (const p of [data.dono, ...data.equipe]) {
    if (!validateNewPassword(p.senha, p.senha).ok) {
      return fail(`A senha de ${p.nome} deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
    }
  }

  const admin = createAdminClient()
  const criados: string[] = []
  let empresaCriada = false
  try {
    const dono = await ensureAuthUser(admin, data.dono)
    if (dono.novo) criados.push(dono.id)
    const equipe: { id: string; novo: boolean }[] = []
    for (const m of data.equipe) {
      const u = await ensureAuthUser(admin, m)
      if (u.novo) criados.push(u.id)
      equipe.push(u)
    }

    const payload = montarPayloadRpc(data, { dono: dono.id, equipe: equipe.map((e) => e.id) })
    const { data: rpcData, error: rpcErr } = await (
      admin as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
      }
    ).rpc('plataforma_provisionar_empresa', { p: payload, p_ator: gate.session.userId })
    if (rpcErr) throw new Error(mensagemErroProvisionamento(rpcErr.message))
    empresaCriada = true
    const r = rpcData as { empresa_id: string; lojas: Record<string, string> }

    const lojas = payload.lojas.map((l) => ({ id: r.lojas[l.chave], nome: l.nome }))
    let itensMarcados: string[] = []
    for (const [i, loja] of lojas.entries()) {
      await ensurePdvConfig(admin, loja.id, dono.id, data.idiomaPreferido)
      await ensureFormasPagamento(admin, loja.id)
      const marcados = await ensureChecklistBootstrap(admin, loja.id, gate.session.userId)
      if (i === 0) itensMarcados = marcados
    }
    const validacao = await validarProvisionamento(admin, lojas[0].id, dono.id)
    if (!validacao.lojaOk || !validacao.donoOk || !validacao.configOk || !validacao.checklistOk) {
      return fail(
        `Empresa criada, mas a configuração ficou incompleta (loja=${validacao.lojaOk} dono=${validacao.donoOk} config=${validacao.configOk} checklist=${validacao.checklistOk}). Abra a implantação da loja para concluir.`,
      )
    }

    revalidatePath(ROUTES.admin.provisionamento)
    revalidatePath(ROUTES.admin.implantacao)
    return {
      ok: true,
      data: {
        empresaId: r.empresa_id,
        lojas,
        equipe: data.equipe.map((m, i) => ({ email: m.email.toLowerCase(), papel: m.papel, novo: equipe[i].novo })),
        lojaId: lojas[0].id,
        lojaNome: lojas[0].nome,
        lojaCodigo: payload.lojas[0].codigo,
        lojaNova: true,
        donoId: dono.id,
        donoEmail: data.dono.email.toLowerCase(),
        donoNovo: dono.novo,
        configInicializada: true,
        checklistPronto: true,
        itensMarcados,
        validacao,
        implantacaoHref: `${ROUTES.admin.implantacao}?lojaId=${encodeURIComponent(lojas[0].id)}`,
      },
    }
  } catch (e) {
    // compensação: só apaga usuários do Auth criados agora e só se a transação do banco não ocorreu.
    if (!empresaCriada) {
      for (const id of criados) {
        try {
          await admin.auth.admin.deleteUser(id)
        } catch {
          // best-effort
        }
      }
    }
    return fail(e instanceof Error ? e.message : 'Erro ao provisionar empresa.')
  }
}

/** Compatibilidade com o wizard antigo: 1 empresa = 1 loja + DONO. */
export async function provisionarLojaAction(input: {
  lojaNome: string
  lojaCodigo?: string | null
  donoNome: string
  donoEmail: string
  donoSenha: string
  idiomaPreferido: 'pt' | 'zh'
}): Promise<ActionResult<ProvisionamentoResult>> {
  return provisionarEmpresaAction({
    empresaNome: input.lojaNome,
    lojas: [{ nome: input.lojaNome, codigo: input.lojaCodigo ?? null }],
    dono: { nome: input.donoNome, email: input.donoEmail, senha: input.donoSenha },
    equipe: [],
    idiomaPreferido: input.idiomaPreferido,
  })
}

/**
 * Gera código de ativação de uso único (24h) para um PDV desktop da loja.
 * Só o hash vai para o banco; o código em claro é mostrado uma única vez.
 */
export async function gerarCodigoAtivacaoPdvAction(
  lojaId: string,
): Promise<ActionResult<{ codigo: string; expiraEm: string }>> {
  const gate = await requireAdminSession()
  if (!gate.ok) return fail(gate.error)
  if (!z.string().uuid().safeParse(lojaId).success) return fail('Loja inválida.')
  const { exibicao } = gerarCodigoAtivacao()
  const admin = createAdminClient()
  const { data, error } = await (
    admin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
    }
  ).rpc('plataforma_registrar_codigo_ativacao_pdv', {
    p_loja_id: lojaId,
    p_codigo_hash: hashCodigoAtivacao(exibicao),
    p_validade_horas: 24,
    p_criado_por: gate.session.userId,
  })
  if (error) {
    if (error.message.includes('EMPRESA_NAO_OPERACIONAL')) return fail('Empresa suspensa ou fora da vigência.')
    if (error.message.includes('ATIVACAO_PDV_LOJA_INVALIDA')) return fail('Loja inexistente, inativa ou sem empresa.')
    return fail(error.message)
  }
  return { ok: true, data: { codigo: exibicao, expiraEm: String((data as { expira_em: string }).expira_em) } }
}
