'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type FuncionarioRow = {
  id: string
  loja_id: string
  nome: string
  cpf: string | null
  telefone: string | null
  email: string | null
  ativo: boolean
  usuario_id: string | null
  usuario_nome: string | null
  usuario_perfil: string | null
  comissao_padrao_percentual: number
  created_at: string
}

export type ComissaoRegraRow = {
  id: string
  tipo_regra: 'padrao' | 'por_produto' | 'por_categoria' | 'por_margem'
  produto_id: string | null
  produto_nome: string | null
  categoria_id: string | null
  categoria_nome: string | null
  margem_minima: number | null
  margem_maxima: number | null
  percentual: number
  vigencia_inicio: string
  vigencia_fim: string | null
  ativo: boolean
  created_at: string
}

export type ComissaoHistoricoRow = {
  id: string
  acao: 'criada' | 'alterada' | 'desativada'
  dados_anteriores: Record<string, unknown> | null
  dados_novos: Record<string, unknown>
  alterado_por_nome: string
  alterado_em: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ─────────────────────────────────────────────────────────────────────────────

const CriarFuncionarioSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  cpf: z.string().nullable().optional(),
  telefone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  ativo: z.boolean().default(true),
  comissao_padrao_percentual: z.number().min(0).max(100).default(5),
})

type CriarFuncionarioInput = z.infer<typeof CriarFuncionarioSchema>

const AtualizarFuncionarioSchema = CriarFuncionarioSchema.extend({
  id: z.string().uuid(),
})

type AtualizarFuncionarioInput = z.infer<typeof AtualizarFuncionarioSchema>

const CriarComissaoRegraSchema = z.object({
  funcionario_id: z.string().uuid(),
  tipo_regra: z.enum(['padrao', 'por_produto', 'por_categoria', 'por_margem']),
  produto_id: z.string().uuid().nullable().optional(),
  categoria_id: z.string().uuid().nullable().optional(),
  margem_minima: z.number().nullable().optional(),
  margem_maxima: z.number().nullable().optional(),
  percentual: z.number().min(0).max(100),
  vigencia_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vigencia_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

type CriarComissaoRegraInput = z.infer<typeof CriarComissaoRegraSchema>

const AtualizarComissaoRegraSchema = z.object({
  id: z.string().uuid(),
  produto_id: z.string().uuid().nullable().optional(),
  categoria_id: z.string().uuid().nullable().optional(),
  margem_minima: z.number().nullable().optional(),
  margem_maxima: z.number().nullable().optional(),
  percentual: z.number().min(0).max(100),
  vigencia_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vigencia_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

type AtualizarComissaoRegraInput = z.infer<typeof AtualizarComissaoRegraSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Funcionarios CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listarFuncionarios(
  filtro?: { ativo?: boolean; perfil?: string },
): Promise<ActionResult<FuncionarioRow[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  // Build query
  let query = supabase
    .from('funcionarios')
    .select(
      `
      id, loja_id, nome, cpf, telefone, email, ativo, created_at,
      usuarios!usuarios_funcionario_id_fkey (
        usuario_id:id,
        usuario_nome:nome,
        usuario_perfil:perfil
      )
    `
    )
    .eq('loja_id', lojaId)

  // Apply filters
  if (filtro?.ativo !== undefined) {
    query = query.eq('ativo', filtro.ativo)
  }

  const { data, error } = await query

  if (error) return { success: false, error: mensagemErroComSecao('Funcionários', error.message) }

  // Get default commission percentage for each funcionario
  const supabaseRLS = await createClient()
  const defaultPercentages: Record<string, number> = {}

  if (data && data.length > 0) {
    const { data: regras } = await supabaseRLS
      .from('comissoes_regras_funcionario')
      .select('funcionario_id, percentual')
      .eq('tipo_regra', 'padrao')
      .eq('ativo', true)
      .in(
        'funcionario_id',
        data.map((f: any) => f.id),
      )

    if (regras) {
      regras.forEach((r: any) => {
        defaultPercentages[r.funcionario_id] = r.percentual ?? 5
      })
    }
  }

  return {
    success: true,
    data: (data ?? []).map((f: any) => ({
      id: f.id,
      loja_id: f.loja_id,
      nome: f.nome,
      cpf: f.cpf,
      telefone: f.telefone,
      email: f.email,
      ativo: f.ativo,
      usuario_id: f.usuarios?.[0]?.usuario_id ?? null,
      usuario_nome: f.usuarios?.[0]?.usuario_nome ?? null,
      usuario_perfil: f.usuarios?.[0]?.usuario_perfil ?? null,
      comissao_padrao_percentual: defaultPercentages[f.id] ?? 5,
      created_at: f.created_at,
    })),
  }
}

export async function criarFuncionario(input: unknown): Promise<ActionResult<FuncionarioRow>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = CriarFuncionarioSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Dados inválidos.' }

  const lojaId = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  // Create funcionario
  const { data: newFuncionario, error: createError } = await supabase
    .from('funcionarios')
    .insert({
      loja_id: lojaId,
      nome: parsed.data.nome,
      cpf: parsed.data.cpf || null,
      telefone: parsed.data.telefone || null,
      email: parsed.data.email || null,
      ativo: parsed.data.ativo,
    })
    .select()
    .single()

  if (createError) return { success: false, error: mensagemErroComSecao('Criar funcionário', createError.message) }

  // Create default commission rule
  const { error: regraError } = await supabase.from('comissoes_regras_funcionario').insert({
    funcionario_id: newFuncionario.id,
    loja_id: lojaId,
    tipo_regra: 'padrao',
    percentual: parsed.data.comissao_padrao_percentual || 5,
    vigencia_inicio: new Date().toISOString().split('T')[0],
    ativo: true,
    created_by: auth.session.userId,
  })

  if (regraError) {
    // Sem transação disponível aqui: remove o funcionário órfão para não deixar
    // um registro sem regra padrão nem permitir duplicata em nova tentativa.
    await supabase.from('funcionarios').delete().eq('id', newFuncionario.id)
    return { success: false, error: mensagemErroComSecao('Criar comissão padrão', regraError.message) }
  }

  revalidatePath('/gerente/funcionarios')

  return {
    success: true,
    data: {
      id: newFuncionario.id,
      loja_id: newFuncionario.loja_id,
      nome: newFuncionario.nome,
      cpf: newFuncionario.cpf,
      telefone: newFuncionario.telefone,
      email: newFuncionario.email,
      ativo: newFuncionario.ativo,
      usuario_id: null,
      usuario_nome: null,
      usuario_perfil: null,
      comissao_padrao_percentual: parsed.data.comissao_padrao_percentual || 5,
      created_at: newFuncionario.created_at,
    },
  }
}

export async function atualizarFuncionario(input: unknown): Promise<ActionResult<FuncionarioRow>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarFuncionarioSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Dados inválidos.' }

  const lojaId = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  // Verify ownership
  const { data: existing, error: checkError } = await supabase
    .from('funcionarios')
    .select('loja_id')
    .eq('id', parsed.data.id)
    .single()

  if (checkError || !existing) return { success: false, error: 'Funcionário não encontrado.' }
  if (existing.loja_id !== lojaId && auth.session.perfil !== 'DONO') {
    return { success: false, error: 'Acesso negado.' }
  }

  // Update funcionario
  const { data: updated, error: updateError } = await supabase
    .from('funcionarios')
    .update({
      nome: parsed.data.nome,
      cpf: parsed.data.cpf,
      telefone: parsed.data.telefone,
      email: parsed.data.email,
      ativo: parsed.data.ativo,
    })
    .eq('id', parsed.data.id)
    .select()
    .single()

  if (updateError) return { success: false, error: mensagemErroComSecao('Atualizar funcionário', updateError.message) }

  // Update default commission rule if provided
  if (parsed.data.comissao_padrao_percentual !== undefined) {
    const { data: regraAtual, error: regraSelectError } = await supabase
      .from('comissoes_regras_funcionario')
      .select('id')
      .eq('funcionario_id', parsed.data.id)
      .eq('tipo_regra', 'padrao')
      .eq('ativo', true)
      .maybeSingle()

    if (regraSelectError) {
      return { success: false, error: mensagemErroComSecao('Atualizar comissão padrão', regraSelectError.message) }
    }

    if (regraAtual) {
      const { error: regraUpdateError } = await supabase
        .from('comissoes_regras_funcionario')
        .update({ percentual: parsed.data.comissao_padrao_percentual })
        .eq('id', regraAtual.id)
      if (regraUpdateError) {
        return { success: false, error: mensagemErroComSecao('Atualizar comissão padrão', regraUpdateError.message) }
      }
    } else {
      // Sem regra padrão ativa (estado inconsistente): recria em vez de falhar silenciosamente.
      const { error: regraCreateError } = await supabase.from('comissoes_regras_funcionario').insert({
        funcionario_id: parsed.data.id,
        loja_id: lojaId,
        tipo_regra: 'padrao',
        percentual: parsed.data.comissao_padrao_percentual,
        vigencia_inicio: new Date().toISOString().split('T')[0],
        ativo: true,
        created_by: auth.session.userId,
      })
      if (regraCreateError) {
        return { success: false, error: mensagemErroComSecao('Atualizar comissão padrão', regraCreateError.message) }
      }
    }
  }

  revalidatePath('/gerente/funcionarios')

  return {
    success: true,
    data: {
      id: updated.id,
      loja_id: updated.loja_id,
      nome: updated.nome,
      cpf: updated.cpf,
      telefone: updated.telefone,
      email: updated.email,
      ativo: updated.ativo,
      usuario_id: null,
      usuario_nome: null,
      usuario_perfil: null,
      comissao_padrao_percentual: parsed.data.comissao_padrao_percentual || 5,
      created_at: updated.created_at,
    },
  }
}

export async function alternarAtivoFuncionario(id: string, ativo: boolean): Promise<ActionResult<boolean>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()

  const { error } = await supabase
    .from('funcionarios')
    .update({ ativo })
    .eq('id', id)

  if (error) return { success: false, error: mensagemErroComSecao('Atualizar status', error.message) }

  revalidatePath('/gerente/funcionarios')
  return { success: true, data: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission Rules CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listarComissoesRegras(funcionarioId: string): Promise<ActionResult<ComissaoRegraRow[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('comissoes_regras_funcionario')
    .select(
      `
      id, tipo_regra, produto_id, categoria_id, margem_minima, margem_maxima,
      percentual, vigencia_inicio, vigencia_fim, ativo, created_at,
      produtos (id, nome),
      categorias (id, nome)
    `
    )
    .eq('funcionario_id', funcionarioId)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: mensagemErroComSecao('Comissões regras', error.message) }

  return {
    success: true,
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      tipo_regra: r.tipo_regra,
      produto_id: r.produto_id,
      produto_nome: r.produtos?.nome ?? null,
      categoria_id: r.categoria_id,
      categoria_nome: r.categorias?.nome ?? null,
      margem_minima: r.margem_minima,
      margem_maxima: r.margem_maxima,
      percentual: r.percentual,
      vigencia_inicio: r.vigencia_inicio,
      vigencia_fim: r.vigencia_fim,
      ativo: r.ativo,
      created_at: r.created_at,
    })),
  }
}

export async function criarComissaoRegra(input: unknown): Promise<ActionResult<ComissaoRegraRow>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = CriarComissaoRegraSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Dados inválidos.' }

  const lojaId = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  // Validate rule type constraints
  if (parsed.data.tipo_regra === 'por_produto' && !parsed.data.produto_id) {
    return { success: false, error: 'Produto é obrigatório para regra por produto.' }
  }
  if (parsed.data.tipo_regra === 'por_categoria' && !parsed.data.categoria_id) {
    return { success: false, error: 'Categoria é obrigatória para regra por categoria.' }
  }
  if (parsed.data.tipo_regra === 'por_margem' && (!parsed.data.margem_minima || !parsed.data.margem_maxima)) {
    return { success: false, error: 'Margem mínima e máxima são obrigatórias para regra por margem.' }
  }

  // Create rule
  const { data: newRegra, error: createError } = await supabase
    .from('comissoes_regras_funcionario')
    .insert({
      funcionario_id: parsed.data.funcionario_id,
      loja_id: lojaId,
      tipo_regra: parsed.data.tipo_regra,
      produto_id: parsed.data.produto_id || null,
      categoria_id: parsed.data.categoria_id || null,
      margem_minima: parsed.data.margem_minima || null,
      margem_maxima: parsed.data.margem_maxima || null,
      percentual: parsed.data.percentual,
      vigencia_inicio: parsed.data.vigencia_inicio,
      vigencia_fim: parsed.data.vigencia_fim || null,
      ativo: true,
      created_by: auth.session.userId,
    })
    .select()
    .single()

  if (createError) return { success: false, error: mensagemErroComSecao('Criar regra', createError.message) }

  // Log to audit trail
  await supabase.from('comissoes_regras_historico').insert({
    regra_id: newRegra.id,
    funcionario_id: parsed.data.funcionario_id,
    acao: 'criada',
    dados_anteriores: null,
    dados_novos: newRegra,
    alterado_por: auth.session.userId,
  })

  revalidatePath('/gerente/funcionarios')

  return {
    success: true,
    data: {
      id: newRegra.id,
      tipo_regra: newRegra.tipo_regra,
      produto_id: newRegra.produto_id,
      produto_nome: null,
      categoria_id: newRegra.categoria_id,
      categoria_nome: null,
      margem_minima: newRegra.margem_minima,
      margem_maxima: newRegra.margem_maxima,
      percentual: newRegra.percentual,
      vigencia_inicio: newRegra.vigencia_inicio,
      vigencia_fim: newRegra.vigencia_fim,
      ativo: newRegra.ativo,
      created_at: newRegra.created_at,
    },
  }
}

export async function desativarComissaoRegra(regraId: string): Promise<ActionResult<boolean>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()

  // Get current rule
  const { data: regra, error: getError } = await supabase
    .from('comissoes_regras_funcionario')
    .select('*')
    .eq('id', regraId)
    .single()

  if (getError || !regra) return { success: false, error: 'Regra não encontrada.' }

  // Deactivate rule
  const { error: updateError } = await supabase.from('comissoes_regras_funcionario').update({ ativo: false }).eq('id', regraId)

  if (updateError) return { success: false, error: mensagemErroComSecao('Desativar regra', updateError.message) }

  // Log to audit trail
  await supabase.from('comissoes_regras_historico').insert({
    regra_id: regraId,
    funcionario_id: regra.funcionario_id,
    acao: 'desativada',
    dados_anteriores: regra,
    dados_novos: { ...regra, ativo: false },
    alterado_por: auth.session.userId,
  })

  revalidatePath('/gerente/funcionarios')
  return { success: true, data: true }
}

export async function carregarComissaoHistorico(funcionarioId: string): Promise<ActionResult<ComissaoHistoricoRow[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('comissoes_regras_historico')
    .select(
      `
      id, acao, dados_anteriores, dados_novos, alterado_em,
      usuarios (nome)
    `
    )
    .eq('funcionario_id', funcionarioId)
    .order('alterado_em', { ascending: false })

  if (error) return { success: false, error: mensagemErroComSecao('Histórico de comissões', error.message) }

  return {
    success: true,
    data: (data ?? []).map((h: any) => ({
      id: h.id,
      acao: h.acao,
      dados_anteriores: h.dados_anteriores,
      dados_novos: h.dados_novos,
      alterado_por_nome: h.usuarios?.nome ?? 'Sistema',
      alterado_em: h.alterado_em,
    })),
  }
}

export async function atualizarComissaoRegra(input: unknown): Promise<ActionResult<ComissaoRegraRow>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = AtualizarComissaoRegraSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Dados inválidos.' }

  const supabase = await createClient()

  const { data: regraAnterior, error: getError } = await supabase
    .from('comissoes_regras_funcionario')
    .select('*')
    .eq('id', parsed.data.id)
    .single()

  if (getError || !regraAnterior) return { success: false, error: 'Regra não encontrada.' }

  // O tipo da regra não é editável (imutável após criada); valida os campos
  // de alvo de acordo com o tipo já existente.
  if (regraAnterior.tipo_regra === 'por_produto' && !parsed.data.produto_id) {
    return { success: false, error: 'Produto é obrigatório para regra por produto.' }
  }
  if (regraAnterior.tipo_regra === 'por_categoria' && !parsed.data.categoria_id) {
    return { success: false, error: 'Categoria é obrigatória para regra por categoria.' }
  }
  if (regraAnterior.tipo_regra === 'por_margem' && (!parsed.data.margem_minima || !parsed.data.margem_maxima)) {
    return { success: false, error: 'Margem mínima e máxima são obrigatórias para regra por margem.' }
  }

  const { data: regraAtualizada, error: updateError } = await supabase
    .from('comissoes_regras_funcionario')
    .update({
      produto_id: regraAnterior.tipo_regra === 'por_produto' ? parsed.data.produto_id || null : null,
      categoria_id: regraAnterior.tipo_regra === 'por_categoria' ? parsed.data.categoria_id || null : null,
      margem_minima: regraAnterior.tipo_regra === 'por_margem' ? parsed.data.margem_minima || null : null,
      margem_maxima: regraAnterior.tipo_regra === 'por_margem' ? parsed.data.margem_maxima || null : null,
      percentual: parsed.data.percentual,
      vigencia_inicio: parsed.data.vigencia_inicio,
      vigencia_fim: parsed.data.vigencia_fim || null,
    })
    .eq('id', parsed.data.id)
    .select()
    .single()

  if (updateError) return { success: false, error: mensagemErroComSecao('Atualizar regra', updateError.message) }

  // Log to audit trail
  await supabase.from('comissoes_regras_historico').insert({
    regra_id: regraAtualizada.id,
    funcionario_id: regraAtualizada.funcionario_id,
    acao: 'alterada',
    dados_anteriores: regraAnterior,
    dados_novos: regraAtualizada,
    alterado_por: auth.session.userId,
  })

  revalidatePath('/gerente/funcionarios')

  return {
    success: true,
    data: {
      id: regraAtualizada.id,
      tipo_regra: regraAtualizada.tipo_regra,
      produto_id: regraAtualizada.produto_id,
      produto_nome: null,
      categoria_id: regraAtualizada.categoria_id,
      categoria_nome: null,
      margem_minima: regraAtualizada.margem_minima,
      margem_maxima: regraAtualizada.margem_maxima,
      percentual: regraAtualizada.percentual,
      vigencia_inicio: regraAtualizada.vigencia_inicio,
      vigencia_fim: regraAtualizada.vigencia_fim,
      ativo: regraAtualizada.ativo,
      created_at: regraAtualizada.created_at,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdown data (produtos / categorias) para o editor de regras
// ─────────────────────────────────────────────────────────────────────────────

export async function listarProdutosParaComissao(): Promise<ActionResult<{ id: string; nome: string }[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome')
    .eq('loja_id', lojaId)
    .eq('ativo', true)
    .order('nome')

  if (error) return { success: false, error: mensagemErroComSecao('Produtos', error.message) }

  return { success: true, data: data ?? [] }
}

export async function listarCategoriasParaComissao(): Promise<ActionResult<{ id: string; nome: string }[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('categorias')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome')

  if (error) return { success: false, error: mensagemErroComSecao('Categorias', error.message) }

  return { success: true, data: data ?? [] }
}
