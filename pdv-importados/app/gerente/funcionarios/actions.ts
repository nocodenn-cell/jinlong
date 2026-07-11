'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

export type FuncionarioRow = {
  id: string
  usuario_id: string
  nome_exibicao: string
  email: string
  cargo: 'operador' | 'gerente' | 'supervisor' | 'outro'
  comissao_percentual: number | null
  comissao_tipo: string | null
  comissao_valor: number | null
  data_admissao: string
  ativo: boolean
  criado_em: string
  criado_por_nome: string | null
}

export type CriarFuncionarioInput = {
  nome_exibicao: string
  email: string
  cargo: 'operador' | 'gerente' | 'supervisor' | 'outro'
  comissao_percentual: number
}

export type AtualizarFuncionarioInput = Partial<
  Omit<CriarFuncionarioInput, 'email'>
>

const PAGE_SIZE = 20

export async function criarFuncionarioAction(
  input: CriarFuncionarioInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  // Validação frontend
  const valErr = validarCriarFuncionario(input)
  if (valErr) return { ok: false, error: valErr }

  try {
    const supabase = await createClient()

    // PASSO 1: Criar auth.user via Supabase Admin API
    // Este é o ponto crítico: auth creation separado de domain logic
    const tempPassword = generateTemporaryPassword()

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: input.email,
      password: tempPassword,
      email_confirm: false, // Usuário deve confirmar email via link
    })

    if (authError || !authData.user) {
      // Mapear erros conhecidos
      if (authError?.message?.includes('already exists')) {
        return { ok: false, error: 'E-mail já registrado no sistema.' }
      }
      return { ok: false, error: `Erro ao criar usuário: ${authError?.message || 'Desconhecido'}` }
    }

    const newAuthUserId = authData.user.id

    // PASSO 2: Inserir em usuarios table (domínio)
    const { error: usuariosError } = await supabase
      .from('usuarios')
      .insert({
        id: newAuthUserId,
        nome: input.nome_exibicao,
        perfil: 'OPERADOR', // Sempre começa como operador
        loja_id: auth.loja_id,
        ativo: true,
        idioma_preferido: auth.idioma,
      })

    if (usuariosError) {
      // Se falhar, tentar deletar o auth.user criado (cleanup)
      try {
        await supabase.auth.admin.deleteUser(newAuthUserId)
      } catch (cleanupError) {
        console.error('[FUNCIONARIOS] CLEANUP FALHOU - ÓRFÃO DEIXADO', {
          newAuthUserId,
          usuariosError,
          cleanupError,
        })
      }
      return { ok: false, error: `Erro ao registrar usuário: ${usuariosError.message}` }
    }

    // PASSO 3: Chamar RPC fn_criar_funcionario() (puro, sem auth)
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'fn_criar_funcionario',
      {
        p_usuario_id: newAuthUserId,
        p_loja_id: auth.loja_id,
        p_nome_exibicao: input.nome_exibicao,
        p_email: input.email,
        p_cargo: input.cargo,
        p_comissao_percentual: input.comissao_percentual,
        p_comissao_tipo: null,
        p_comissao_valor: null,
      },
    )

    if (rpcError) {
      // Cleanup: deletar auth.user e usuarios
      try {
        await supabase.auth.admin.deleteUser(newAuthUserId)
        await supabase.from('usuarios').delete().eq('id', newAuthUserId)
      } catch (cleanupError) {
        console.error('[FUNCIONARIOS] CLEANUP FALHOU APÓS RPC ERROR - ÓRFÃO DEIXADO', {
          newAuthUserId,
          rpcError,
          cleanupError,
        })
      }
      const msg = rpcResult?.[0]?.message || rpcError.message
      return { ok: false, error: `Erro ao criar funcionário: ${msg}` }
    }

    const result = rpcResult?.[0]
    if (!result?.ok) {
      // Cleanup
      try {
        await supabase.auth.admin.deleteUser(newAuthUserId)
        await supabase.from('usuarios').delete().eq('id', newAuthUserId)
      } catch (cleanupError) {
        console.error('[FUNCIONARIOS] CLEANUP FALHOU APÓS RPC RETORNAR FALSE - ÓRFÃO DEIXADO', {
          newAuthUserId,
          rpcMessage: result?.message,
          cleanupError,
        })
      }
      return { ok: false, error: result?.message || 'Erro desconhecido ao criar funcionário.' }
    }

    // PASSO 4: Enviar email com recovery link via Edge Function
    // Isso é assíncrono — não esperar resposta, apenas tentar
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (supabaseUrl) {
        await fetch(`${supabaseUrl}/functions/v1/send-employee-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: input.email,
            nome: input.nome_exibicao,
            auth_user_id: newAuthUserId,
          }),
        }).catch((err) => {
          // Log mas não falha o fluxo — usuário já foi criado
          console.error('[FUNCIONARIOS] Edge Function error (non-blocking):', err)
        })
      }
    } catch {
      // Ignorar erro de email — o funcionário já foi criado com sucesso
    }

    revalidatePath(`/app/admin/funcionarios`)
    revalidatePath(`/app/gerente/funcionarios`)
    revalidateTag('funcionarios-list')

    return { ok: true, id: result.funcionario_id }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao criar funcionário.',
    }
  }
}

export async function listarFuncionariosPaginadoAction(
  page: number,
  opts?: { termo?: string; status?: 'todos' | 'ativos' | 'inativos' },
): Promise<
  { ok: true; funcionarios: FuncionarioRow[]; hasMore: boolean } | { ok: false; error: string }
> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  try {
    const supabase = await createClient()

    // Chamar RPC que filtra automaticamente pela loja do auth user via RLS
    const { data, error } = await supabase.rpc('fn_listar_funcionarios_gerente', {
      p_loja_id: auth.loja_id,
      p_termo: opts?.termo || null,
      p_status: opts?.status || 'todos',
    })

    if (error) return { ok: false, error: error.message }

    const rows = (data ?? []) as FuncionarioRow[]

    // Paginação manual (RPC retorna todos os resultados)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE
    const paginated = rows.slice(from, to + 1)
    const hasMore = paginated.length > PAGE_SIZE

    return {
      ok: true,
      funcionarios: paginated.slice(0, PAGE_SIZE),
      hasMore,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao listar funcionários.' }
  }
}

export async function atualizarFuncionarioAction(
  funcionarioId: string,
  input: AtualizarFuncionarioInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!funcionarioId) return { ok: false, error: 'ID do funcionário obrigatório.' }

  try {
    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('fn_atualizar_funcionario', {
      p_funcionario_id: funcionarioId,
      p_nome_exibicao: input.nome_exibicao || null,
      p_cargo: input.cargo || null,
      p_comissao_percentual: input.comissao_percentual ?? null,
    })

    if (error) return { ok: false, error: error.message }

    const rpcResult = result?.[0]
    if (!rpcResult?.ok) {
      return { ok: false, error: rpcResult?.message || 'Erro ao atualizar funcionário.' }
    }

    revalidatePath(`/app/admin/funcionarios`)
    revalidatePath(`/app/gerente/funcionarios`)
    revalidateTag('funcionarios-list')

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao atualizar funcionário.' }
  }
}

export async function desativarFuncionarioAction(
  funcionarioId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!funcionarioId) return { ok: false, error: 'ID do funcionário obrigatório.' }

  try {
    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('fn_desativar_funcionario', {
      p_funcionario_id: funcionarioId,
    })

    if (error) return { ok: false, error: error.message }

    const rpcResult = result?.[0]
    if (!rpcResult?.ok) {
      return { ok: false, error: rpcResult?.message || 'Erro ao desativar funcionário.' }
    }

    revalidatePath(`/app/admin/funcionarios`)
    revalidatePath(`/app/gerente/funcionarios`)
    revalidateTag('funcionarios-list')

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao desativar funcionário.' }
  }
}

export async function buscarRelatorioComissoesAction(
  de?: string,
  ate?: string,
): Promise<any[] | null> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return null

  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('resumo_comissoes_por_funcionario', {
      p_loja_id: auth.loja_id,
      p_de: de ? new Date(de).toISOString().split('T')[0] : null,
      p_ate: ate ? new Date(ate).toISOString().split('T')[0] : null,
    })

    if (error) return null
    return data ?? []
  } catch {
    return null
  }
}

export async function buscarRelatorioVendasAction(
  de?: string,
  ate?: string,
): Promise<any[] | null> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return null

  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('total_vendas_por_funcionario', {
      p_loja_id: auth.loja_id,
      p_de: de ? new Date(de).toISOString().split('T')[0] : null,
      p_ate: ate ? new Date(ate).toISOString().split('T')[0] : null,
    })

    if (error) return null
    return data ?? []
  } catch {
    return null
  }
}

// ============================================================================
// VALIDAÇÃO
// ============================================================================

function validarCriarFuncionario(input: CriarFuncionarioInput): string | null {
  if (!input.nome_exibicao || input.nome_exibicao.trim().length < 2) {
    return 'Nome deve ter pelo menos 2 caracteres.'
  }

  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return 'E-mail inválido.'
  }

  if (!input.cargo || !['operador', 'gerente', 'supervisor', 'outro'].includes(input.cargo)) {
    return 'Cargo inválido.'
  }

  if (
    input.comissao_percentual === null ||
    input.comissao_percentual === undefined ||
    input.comissao_percentual < 0 ||
    input.comissao_percentual > 100
  ) {
    return 'Comissão deve estar entre 0 e 100.'
  }

  return null
}

function generateTemporaryPassword(): string {
  // Gerar uma senha temporária segura (não será usada, apenas para criar o auth.user)
  // O usuário definirá sua própria senha via recovery link
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()'
  let password = ''
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}
