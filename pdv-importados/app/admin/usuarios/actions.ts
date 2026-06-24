'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdminSession } from '@/lib/admin/auth/assertAdminSession'
import { ROUTES } from '@shared-core/navigation/routes'

type R = { success: true } | { success: false; error: string }

export type PerfilUsuario = 'OPERADOR' | 'GERENTE' | 'DONO' | 'ADMIN'

export async function toggleAtivoUsuario(input: {
  usuario_id: string
  ativo_atual: boolean
}): Promise<R> {
  const auth = await assertAdminSession('usuarios:toggle', {
    pathname: ROUTES.admin.usuarios,
    resource: `route:${ROUTES.admin.usuarios}`,
  })
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('usuarios')
    .update({ ativo: !input.ativo_atual })
    .eq('id', input.usuario_id)

  if (error) return { success: false, error: error.message }
  revalidatePath(ROUTES.admin.usuarios)
  return { success: true }
}

export async function criarUsuario(input: {
  email: string
  senha: string
  nome: string
  perfil: PerfilUsuario
  loja_id: string
  idioma: 'pt' | 'zh'
}): Promise<R> {
  const auth = await assertAdminSession('usuarios:criar', {
    pathname: ROUTES.admin.usuarios,
    resource: `route:${ROUTES.admin.usuarios}`,
  })
  if (!auth.ok) return { success: false, error: auth.error }

  if (!input.email.trim()) return { success: false, error: 'E-mail obrigatório' }
  if (!input.senha || input.senha.length < 6) return { success: false, error: 'Senha deve ter no mínimo 6 caracteres' }
  if (!input.nome.trim()) return { success: false, error: 'Nome obrigatório' }

  let adminClient
  try {
    adminClient = createAdminClient()
  } catch {
    return { success: false, error: 'Criação de usuário não disponível: configure SUPABASE_SERVICE_ROLE_KEY.' }
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: input.email.trim(),
    password: input.senha,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return { success: false, error: authError?.message ?? 'Erro ao criar usuário no auth' }
  }

  const supabase = await createClient()
  const { error: insertError } = await supabase.from('usuarios').insert({
    id: authData.user.id,
    nome: input.nome.trim(),
    perfil: input.perfil,
    loja_id: input.loja_id,
    idioma_preferido: input.idioma,
    ativo: true,
  })

  if (insertError) {
    // Rollback: remove auth user se o insert falhou
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: insertError.message }
  }

  revalidatePath(ROUTES.admin.usuarios)
  return { success: true }
}
