'use server'

// R2 — Cadastro de funcionários (operadores/gerentes).
// ISOLADO do fluxo de venda: não importa nem toca vendas, comissão ou RPCs de caixa.
// Criação de usuário usa o service-role (createAdminClient), SOMENTE no servidor,
// e é sempre precedida por assertGerenteSession. Não há migration nova: usa a
// tabela `usuarios` existente; o service-role ignora RLS por design.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { createAdminClient } from '@/lib/supabase/admin'

export type FuncionarioRow = {
  id: string
  nome: string
  perfil: string
  ativo: boolean
  criadoEm: string | null
}

export type FuncionariosActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const PERFIS_CRIAVEIS = ['OPERADOR', 'GERENTE'] as const

const NovoFuncionarioSchema = z.object({
  nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(120),
  email: z.string().trim().email('Informe um e-mail válido.').max(180),
  perfil: z.enum(PERFIS_CRIAVEIS, {
    errorMap: () => ({ message: 'Perfil inválido. Use OPERADOR ou GERENTE.' }),
  }),
  senha: z.string().min(8, 'A senha temporária deve ter pelo menos 8 caracteres.').max(72),
})

async function obterLojaIdDoCriador(
  admin: ReturnType<typeof createAdminClient>,
  criadorId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('usuarios')
    .select('loja_id')
    .eq('id', criadorId)
    .maybeSingle()
  return data?.loja_id ?? null
}

/** Lista funcionários da mesma loja do gerente autenticado. */
export async function listarFuncionarios(): Promise<FuncionariosActionResult<FuncionarioRow[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = createAdminClient()
  const lojaId = await obterLojaIdDoCriador(admin, auth.session.userId)

  let query = admin
    .from('usuarios')
    .select('id, nome, perfil, ativo, created_at')
    .order('created_at', { ascending: false })
  if (lojaId) query = query.eq('loja_id', lojaId)

  const { data, error } = await query
  if (error) return { success: false, error: 'Não foi possível carregar os funcionários.' }

  return {
    success: true,
    data: (data ?? []).map((u) => ({
      id: u.id,
      nome: u.nome,
      perfil: u.perfil,
      ativo: u.ativo,
      criadoEm: u.created_at ?? null,
    })),
  }
}

/** Cria um novo funcionário: usuário no Supabase Auth + linha em `usuarios`. */
export async function cadastrarFuncionario(
  input: unknown,
): Promise<FuncionariosActionResult<{ id: string }>> {
  const parsed = NovoFuncionarioSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  // Somente DONO pode criar outro GERENTE; gerente comum cria apenas OPERADOR.
  if (parsed.data.perfil === 'GERENTE' && auth.session.perfil !== 'DONO') {
    return { success: false, error: 'Apenas o dono pode cadastrar um gerente.' }
  }

  const admin = createAdminClient()
  const lojaId = await obterLojaIdDoCriador(admin, auth.session.userId)

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.senha,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.nome },
  })
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? ''
    if (/already been registered|already exists|duplicate/i.test(msg)) {
      return { success: false, error: 'Já existe um usuário com esse e-mail.' }
    }
    return { success: false, error: 'Não foi possível criar o acesso do funcionário.' }
  }

  const novoId = created.user.id
  const { error: insertErr } = await admin.from('usuarios').insert({
    id: novoId,
    nome: parsed.data.nome,
    perfil: parsed.data.perfil,
    ativo: true,
    ...(lojaId ? { loja_id: lojaId } : {}),
  })

  if (insertErr) {
    // Rollback: remove o usuário de Auth para não deixar acesso órfão sem perfil.
    await admin.auth.admin.deleteUser(novoId).catch(() => undefined)
    return { success: false, error: 'Não foi possível vincular o perfil do funcionário.' }
  }

  revalidatePath('/admin/funcionarios')
  return { success: true, data: { id: novoId } }
}

/** Ativa/desativa um funcionário (não permite o gerente desativar a si mesmo). */
export async function definirFuncionarioAtivo(
  input: unknown,
): Promise<FuncionariosActionResult<{ id: string; ativo: boolean }>> {
  const parsed = z
    .object({ id: z.string().uuid('Id inválido.'), ativo: z.boolean() })
    .safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  if (parsed.data.id === auth.session.userId) {
    return { success: false, error: 'Você não pode desativar a própria conta.' }
  }

  const admin = createAdminClient()
  const lojaId = await obterLojaIdDoCriador(admin, auth.session.userId)

  let update = admin.from('usuarios').update({ ativo: parsed.data.ativo }).eq('id', parsed.data.id)
  if (lojaId) update = update.eq('loja_id', lojaId)

  const { error } = await update
  if (error) return { success: false, error: 'Não foi possível atualizar o funcionário.' }

  revalidatePath('/admin/funcionarios')
  return { success: true, data: { id: parsed.data.id, ativo: parsed.data.ativo } }
}
