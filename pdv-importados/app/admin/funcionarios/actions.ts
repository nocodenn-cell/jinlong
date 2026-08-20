'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createAdminClient } from '@/lib/supabase/admin'
import { PASSWORD_MIN_LENGTH, validateNewPassword } from '@/lib/auth/passwordPolicy'
import { ROUTES } from '@shared-core/navigation/routes'
import {
  isPerfilFuncionarioUi,
  podeAtribuirPerfil,
  podeDesativarAlvo,
  podeEditarAlvo,
  type PerfilFuncionarioUi,
} from './funcionarioPolicies'

export type FuncionarioListRow = {
  id: string
  nome: string
  email: string | null
  perfil: string
  idioma_preferido: string
  ativo: boolean
  created_at: string
}

export type ActionOk<T> = { ok: true; data: T }
export type ActionErr = { ok: false; error: string }
export type ActionResult<T> = ActionOk<T> | ActionErr

const CreateSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  perfil: z.enum(['OPERADOR', 'GERENTE']),
  idioma_preferido: z.enum(['pt', 'zh']),
  senha: z.string().min(PASSWORD_MIN_LENGTH).max(128),
})

const UpdateSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2).max(120),
  perfil: z.enum(['OPERADOR', 'GERENTE']),
  idioma_preferido: z.enum(['pt', 'zh']),
  senhaNova: z.string().max(128).optional(),
})

function fail(error: string): ActionErr {
  return { ok: false, error }
}

function revalidateFuncionarios(): void {
  revalidatePath(ROUTES.admin.funcionarios)
}

async function requireLojaSession() {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  if (!auth.session.lojaId) {
    return { ok: false as const, error: 'Conta sem loja vinculada.' }
  }
  return { ok: true as const, session: auth.session }
}

async function emailPorUsuarioId(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) return null
  return data.user?.email ?? null
}

async function mapRow(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    id: string
    nome: string
    perfil: string
    idioma_preferido: string
    ativo: boolean | null
    created_at: string
  },
): Promise<FuncionarioListRow> {
  return {
    id: row.id,
    nome: row.nome,
    email: await emailPorUsuarioId(admin, row.id),
    perfil: row.perfil,
    idioma_preferido: row.idioma_preferido,
    ativo: row.ativo !== false,
    created_at: row.created_at,
  }
}

export async function listarFuncionariosAction(): Promise<ActionResult<FuncionarioListRow[]>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('usuarios')
      .select('id, nome, perfil, idioma_preferido, ativo, created_at')
      .eq('loja_id', gate.session.lojaId!)
      .order('nome', { ascending: true })
      .limit(100)

    if (error) return fail(error.message)

    const rows = await Promise.all((data ?? []).map((r) => mapRow(admin, r)))
    return { ok: true, data: rows }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao listar funcionários.')
  }
}

export async function criarFuncionarioAction(input: {
  nome: string
  email: string
  perfil: PerfilFuncionarioUi
  idioma_preferido: 'pt' | 'zh'
  senha: string
}): Promise<ActionResult<FuncionarioListRow>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)

  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) return fail('Dados inválidos. Verifique nome, e-mail, perfil e senha.')

  if (!podeAtribuirPerfil(gate.session.perfil, parsed.data.perfil)) {
    return fail('Você não tem permissão para criar este perfil.')
  }

  const senhaCheck = validateNewPassword(parsed.data.senha, parsed.data.senha)
  if (!senhaCheck.ok) return fail(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)

  let createdUserId: string | null = null
  try {
    const admin = createAdminClient()
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.senha,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.nome },
    })

    if (authErr || !created.user) {
      const msg = authErr?.message ?? 'Falha ao criar usuário no Auth.'
      if (/already|registered|exists|duplicate/i.test(msg)) {
        return fail('Já existe uma conta com este e-mail.')
      }
      return fail(msg)
    }

    createdUserId = created.user.id
    const { error: dbErr } = await admin.from('usuarios').insert({
      id: created.user.id,
      nome: parsed.data.nome,
      perfil: parsed.data.perfil,
      idioma_preferido: parsed.data.idioma_preferido,
      loja_id: gate.session.lojaId!,
      ativo: true,
    })

    if (dbErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      createdUserId = null
      return fail(dbErr.message)
    }

    revalidateFuncionarios()
    const row = await mapRow(admin, {
      id: created.user.id,
      nome: parsed.data.nome,
      perfil: parsed.data.perfil,
      idioma_preferido: parsed.data.idioma_preferido,
      ativo: true,
      created_at: new Date().toISOString(),
    })
    return { ok: true, data: row }
  } catch (e) {
    if (createdUserId) {
      try {
        const admin = createAdminClient()
        await admin.auth.admin.deleteUser(createdUserId)
      } catch {
        // best-effort cleanup
      }
    }
    return fail(e instanceof Error ? e.message : 'Erro ao criar funcionário.')
  }
}

export async function atualizarFuncionarioAction(input: {
  id: string
  nome: string
  perfil: PerfilFuncionarioUi
  idioma_preferido: 'pt' | 'zh'
  senhaNova?: string
}): Promise<ActionResult<FuncionarioListRow>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)

  const parsed = UpdateSchema.safeParse(input)
  if (!parsed.success) return fail('Dados inválidos.')

  try {
    const admin = createAdminClient()
    const { data: alvo, error: loadErr } = await admin
      .from('usuarios')
      .select('id, nome, perfil, idioma_preferido, ativo, created_at, loja_id')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (loadErr || !alvo) return fail('Funcionário não encontrado.')
    if (alvo.loja_id !== gate.session.lojaId) return fail('Funcionário de outra loja.')

    const ator = { id: gate.session.userId, perfil: gate.session.perfil }
    if (!podeEditarAlvo(ator, { id: alvo.id, perfil: alvo.perfil })) {
      return fail('Você não tem permissão para editar este funcionário.')
    }

    if (!podeAtribuirPerfil(gate.session.perfil, parsed.data.perfil)) {
      return fail('Você não tem permissão para atribuir este perfil.')
    }
    if (!isPerfilFuncionarioUi(parsed.data.perfil)) {
      return fail('Perfil inválido.')
    }

    const { error: updErr } = await admin
      .from('usuarios')
      .update({
        nome: parsed.data.nome,
        perfil: parsed.data.perfil,
        idioma_preferido: parsed.data.idioma_preferido,
      })
      .eq('id', parsed.data.id)
      .eq('loja_id', gate.session.lojaId!)

    if (updErr) return fail(updErr.message)

    const senhaNova = parsed.data.senhaNova?.trim()
    if (senhaNova) {
      const check = validateNewPassword(senhaNova, senhaNova)
      if (!check.ok) {
        return fail(`A nova senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
      }
      const { error: pwdErr } = await admin.auth.admin.updateUserById(parsed.data.id, {
        password: senhaNova,
      })
      if (pwdErr) return fail(pwdErr.message)
    }

    const { error: metaErr } = await admin.auth.admin.updateUserById(parsed.data.id, {
      user_metadata: { full_name: parsed.data.nome },
    })
    if (metaErr) {
      // nome em usuarios já gravado — não falha a ação
      console.error('[funcionarios.update.meta]', metaErr.message)
    }

    revalidateFuncionarios()
    return {
      ok: true,
      data: await mapRow(admin, {
        id: alvo.id,
        nome: parsed.data.nome,
        perfil: parsed.data.perfil,
        idioma_preferido: parsed.data.idioma_preferido,
        ativo: alvo.ativo,
        created_at: alvo.created_at,
      }),
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao atualizar funcionário.')
  }
}

export async function verificarEmailDisponiveAction(email: string): Promise<ActionResult<boolean>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)

  if (!z.string().email().safeParse(email.trim()).success) {
    return fail('Email inválido.')
  }

  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.listUsers()
    const exists = data.users.some((u) => u.email === email.toLowerCase().trim())
    return { ok: true, data: !exists }
  } catch (e) {
    return { ok: true, data: true }
  }
}

export async function definirAtivoFuncionarioAction(
  id: string,
  ativo: boolean,
): Promise<ActionResult<{ id: string; ativo: boolean }>> {
  const gate = await requireLojaSession()
  if (!gate.ok) return fail(gate.error)
  if (!z.string().uuid().safeParse(id).success) return fail('Identificador inválido.')

  try {
    const admin = createAdminClient()
    const { data: alvo, error: loadErr } = await admin
      .from('usuarios')
      .select('id, perfil, loja_id')
      .eq('id', id)
      .maybeSingle()

    if (loadErr || !alvo) return fail('Funcionário não encontrado.')
    if (alvo.loja_id !== gate.session.lojaId) return fail('Funcionário de outra loja.')

    const ator = { id: gate.session.userId, perfil: gate.session.perfil }
    if (!podeDesativarAlvo(ator, { id: alvo.id, perfil: alvo.perfil })) {
      return fail(
        ativo
          ? 'Você não tem permissão para reativar este funcionário.'
          : 'Você não pode desativar esta conta.',
      )
    }

    const { error } = await admin
      .from('usuarios')
      .update({ ativo })
      .eq('id', id)
      .eq('loja_id', gate.session.lojaId!)

    if (error) return fail(error.message)

    revalidateFuncionarios()
    return { ok: true, data: { id, ativo } }
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Erro ao alterar status.')
  }
}
