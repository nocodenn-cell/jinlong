'use server'

/**
 * Módulo Comissão (P0–P2) — server actions.
 * Toda regra de negócio e autorização fica no banco (RPCs SECURITY DEFINER + RLS por empresa);
 * aqui só há validação de entrada e mapeamento. Nada é lançado em caixa, contas a pagar ou folha.
 */
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

export type ModuloResult<T> = { success: true; data: T } | { success: false; error: string }

async function ctxGestor() {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  return { ok: true as const, lojaId: auth.session.lojaId ?? LOJA_MATRIZ_ID, supabase: await createClient() }
}

// ── P0: falhas ────────────────────────────────────────────────────────────────
export type FalhaComissao = {
  id: string
  vendaId: string
  etapa: 'APURACAO' | 'AJUSTE' | 'REATRIBUICAO'
  motivo: string
  tentativas: number
  ultimaTentativaEm: string
}

export async function listarFalhasComissao(): Promise<ModuloResult<FalhaComissao[]>> {
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { data, error } = await c.supabase
    .from('comissoes_falhas')
    .select('id, venda_id, etapa, motivo, tentativas, ultima_tentativa_em')
    .eq('loja_id', c.lojaId)
    .is('resolvida_em', null)
    .order('ultima_tentativa_em', { ascending: false })
    .limit(200)
  if (error) return { success: false, error: mensagemErroComSecao('Comissões', error.message) }
  return {
    success: true,
    data: (data ?? []).map((r) => ({
      id: r.id,
      vendaId: r.venda_id,
      etapa: r.etapa as FalhaComissao['etapa'],
      motivo: r.motivo,
      tentativas: r.tentativas,
      ultimaTentativaEm: r.ultima_tentativa_em,
    })),
  }
}

export async function reprocessarComissaoVenda(vendaId: string): Promise<ModuloResult<{ ok: boolean; falha: string | null }>> {
  if (!z.string().uuid().safeParse(vendaId).success) return { success: false, error: 'Venda inválida.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { data, error } = await c.supabase.rpc('reprocessar_comissao_venda', { p_venda_id: vendaId })
  if (error) return { success: false, error: mensagemErroComSecao('Reprocessar comissão', error.message) }
  const r = (data ?? {}) as { ok?: boolean; falha?: string | null }
  revalidatePath('/admin/comissoes')
  return { success: true, data: { ok: !!r.ok, falha: r.falha ?? null } }
}

async function empresaDaLoja(c: { supabase: Awaited<ReturnType<typeof createClient>>; lojaId: string }) {
  const { data } = await c.supabase.from('lojas').select('empresa_id').eq('id', c.lojaId).maybeSingle()
  return (data?.empresa_id as string | null | undefined) ?? null
}

// ── P1: regras ────────────────────────────────────────────────────────────────
export type RegraComissaoLinha = {
  id: string
  lojaId: string | null
  usuarioId: string | null
  usuarioNome: string | null
  cargo: string | null
  produtoId: string | null
  produtoNome: string | null
  categoriaId: string | null
  categoriaNome: string | null
  canal: 'VAREJO' | 'ATACADO' | null
  tipoCalculo: 'percentual' | 'fixo'
  valor: number
  vigenciaInicio: string
  vigenciaFim: string | null
  ativo: boolean
  descricao: string | null
}

export type OpcoesRegras = {
  vendedores: { id: string; nome: string }[]
  cargos: string[]
  produtos: { id: string; nome: string }[]
  categorias: { id: string; nome: string }[]
}

export async function listarRegrasComissao(): Promise<ModuloResult<{ regras: RegraComissaoLinha[]; opcoes: OpcoesRegras }>> {
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const empresaId = await empresaDaLoja(c)
  if (!empresaId) return { success: false, error: 'Empresa não encontrada.' }
  const [regras, vend, prods, cats] = await Promise.all([
    c.supabase
      .from('comissoes_regras')
      .select('*, usuarios:usuario_id(nome), produtos:produto_id(nome), categorias:categoria_id(nome)')
      .eq('empresa_id', empresaId)
      .order('ativo', { ascending: false })
      .order('vigencia_inicio', { ascending: false }),
    c.supabase.rpc('listar_vendedores_loja', { p_loja_id: c.lojaId }),
    c.supabase.from('produtos').select('id, nome').eq('loja_id', c.lojaId).eq('ativo', true).order('nome').limit(1000),
    c.supabase.from('categorias').select('id, nome').eq('empresa_id', empresaId).order('nome'),
  ])
  if (regras.error) return { success: false, error: mensagemErroComSecao('Regras de comissão', regras.error.message) }
  type Row = (typeof regras.data)[number] & { usuarios?: { nome: string } | null; produtos?: { nome: string } | null; categorias?: { nome: string } | null }
  const linhas = ((regras.data ?? []) as Row[]).map((r) => ({
    id: r.id,
    lojaId: r.loja_id,
    usuarioId: r.usuario_id,
    usuarioNome: r.usuarios?.nome ?? null,
    cargo: r.cargo,
    produtoId: r.produto_id,
    produtoNome: r.produtos?.nome ?? null,
    categoriaId: r.categoria_id,
    categoriaNome: r.categorias?.nome ?? null,
    canal: r.canal as RegraComissaoLinha['canal'],
    tipoCalculo: r.tipo_calculo as RegraComissaoLinha['tipoCalculo'],
    valor: Number(r.valor),
    vigenciaInicio: r.vigencia_inicio,
    vigenciaFim: r.vigencia_fim,
    ativo: r.ativo,
    descricao: r.descricao,
  }))
  const vendedores = ((vend.data ?? []) as Array<{ id: string | null; nome: string | null }>)
    .filter((v): v is { id: string; nome: string | null } => !!v.id)
    .map((v) => ({ id: v.id, nome: v.nome ?? '—' }))
  // Cargos: tabela do PR #606 (funcionario_dados) quando existir; senão os já usados nas regras.
  const cargos = new Set(linhas.map((l) => l.cargo).filter((x): x is string => !!x))
  try {
    const fd = await (c.supabase as unknown as { from: (t: string) => { select: (s: string) => { in: (k: string, v: string[]) => Promise<{ data: { cargo: string | null }[] | null }> } } })
      .from('funcionario_dados').select('cargo').in('usuario_id', vendedores.map((v) => v.id))
    for (const r of fd.data ?? []) if (r.cargo?.trim()) cargos.add(r.cargo.trim().toLowerCase())
  } catch { /* tabela opcional */ }
  return {
    success: true,
    data: {
      regras: linhas,
      opcoes: {
        vendedores,
        cargos: [...cargos].sort(),
        produtos: (prods.data ?? []).map((p) => ({ id: p.id, nome: p.nome })),
        categorias: (cats.data ?? []).map((p) => ({ id: p.id, nome: p.nome })),
      },
    },
  }
}

const uuidOpt = z.string().uuid().nullable()
const regraSchema = z
  .object({
    id: z.string().uuid().optional(),
    somenteEstaLoja: z.boolean(),
    usuarioId: uuidOpt,
    cargo: z.string().trim().max(80).nullable(),
    produtoId: uuidOpt,
    categoriaId: uuidOpt,
    canal: z.enum(['VAREJO', 'ATACADO']).nullable(),
    tipoCalculo: z.enum(['percentual', 'fixo']),
    valor: z.number().finite().min(0),
    vigenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    vigenciaFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    ativo: z.boolean(),
    descricao: z.string().trim().max(200).nullable(),
  })
  .refine((r) => !(r.usuarioId && r.cargo), { message: 'Escolha funcionário OU cargo.' })
  .refine((r) => !(r.produtoId && r.categoriaId), { message: 'Escolha produto OU categoria.' })
  .refine((r) => r.tipoCalculo === 'fixo' || r.valor <= 100, { message: 'Percentual acima de 100%.' })
  .refine((r) => !r.vigenciaFim || r.vigenciaFim >= r.vigenciaInicio, { message: 'Fim da vigência antes do início.' })

export type RegraInput = z.input<typeof regraSchema>

export async function salvarRegraComissao(input: RegraInput): Promise<ModuloResult<{ id: string }>> {
  const p = regraSchema.safeParse(input)
  if (!p.success) return { success: false, error: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const empresaId = await empresaDaLoja(c)
  if (!empresaId) return { success: false, error: 'Empresa não encontrada.' }
  const r = p.data
  const row = {
    empresa_id: empresaId,
    loja_id: r.somenteEstaLoja ? c.lojaId : null,
    usuario_id: r.usuarioId,
    cargo: r.cargo ? r.cargo.toLowerCase() : null,
    produto_id: r.produtoId,
    categoria_id: r.categoriaId,
    canal: r.canal,
    tipo_calculo: r.tipoCalculo,
    valor: Math.round(r.valor * 10000) / 10000,
    vigencia_inicio: r.vigenciaInicio,
    vigencia_fim: r.vigenciaFim,
    ativo: r.ativo,
    descricao: r.descricao || null,
  }
  const q = r.id
    ? c.supabase.from('comissoes_regras').update(row).eq('id', r.id).select('id').single()
    : c.supabase.from('comissoes_regras').insert(row).select('id').single()
  const { data, error } = await q
  if (error) return { success: false, error: mensagemErroComSecao('Regras de comissão', error.message) }
  revalidatePath('/admin/comissoes/regras')
  return { success: true, data: { id: data.id } }
}

export async function excluirRegraComissao(id: string): Promise<ModuloResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: 'Regra inválida.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { error } = await c.supabase.from('comissoes_regras').delete().eq('id', id)
  if (error) return { success: false, error: mensagemErroComSecao('Regras de comissão', error.message) }
  revalidatePath('/admin/comissoes/regras')
  return { success: true, data: null }
}

export type PreviaRegra = { regraId: string | null; nivel: number | null; tipoCalculo: string; valor: number; origem: string; cargo: string | null }

export async function simularRegraComissao(input: { vendedorId: string; produtoId: string; canal: 'VAREJO' | 'ATACADO'; data: string }): Promise<ModuloResult<PreviaRegra>> {
  const p = z.object({ vendedorId: z.string().uuid(), produtoId: z.string().uuid(), canal: z.enum(['VAREJO', 'ATACADO']), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(input)
  if (!p.success) return { success: false, error: 'Escolha vendedor e produto.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { data, error } = await c.supabase.rpc('comissao_simular_regra', {
    p_loja_id: c.lojaId, p_vendedor_id: p.data.vendedorId, p_produto_id: p.data.produtoId, p_canal: p.data.canal, p_data: p.data.data,
  })
  if (error) return { success: false, error: mensagemErroComSecao('Prévia', error.message) }
  const r = (data ?? [])[0]
  if (!r) return { success: false, error: 'Sem regra.' }
  return { success: true, data: { regraId: r.regra_id, nivel: r.nivel, tipoCalculo: r.tipo_calculo, valor: Number(r.valor), origem: r.origem, cargo: r.cargo } }
}

// ── P1: fechamento e relatório ────────────────────────────────────────────────
export type StatusPeriodo = 'ABERTO' | 'EM_REVISAO' | 'APROVADO' | 'PAGO'
export type LinhaVendedorPeriodo = {
  operadorId: string; nome: string; vendas: number; base: number; comissao: number; ajustes: number; bonusMeta: number; total: number
}
const compSchema = z.string().regex(/^\d{4}-\d{2}$/)

export async function relatorioComissaoMes(competencia: string): Promise<ModuloResult<{ status: StatusPeriodo; linhas: LinhaVendedorPeriodo[] }>> {
  if (!compSchema.safeParse(competencia).success) return { success: false, error: 'Competência inválida.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { data, error } = await c.supabase.rpc('comissao_relatorio_vendedores', { p_loja_id: c.lojaId, p_competencia: `${competencia}-01` })
  if (error) return { success: false, error: mensagemErroComSecao('Relatório de comissões', error.message) }
  const { data: per } = await c.supabase.from('comissoes_periodos').select('status').eq('loja_id', c.lojaId).eq('competencia', `${competencia}-01`).maybeSingle()
  return {
    success: true,
    data: {
      status: ((per?.status as StatusPeriodo | undefined) ?? 'ABERTO'),
      linhas: ((data ?? []) as Array<{ operador_id: string; operador_nome: string; vendas: number; base: number; comissao: number; ajustes: number; bonus_meta: number; total: number }>).map((r) => ({
        operadorId: r.operador_id, nome: r.operador_nome, vendas: r.vendas, base: Number(r.base), comissao: Number(r.comissao),
        ajustes: Number(r.ajustes), bonusMeta: Number(r.bonus_meta), total: Number(r.total),
      })),
    },
  }
}

export async function transicionarPeriodoComissao(competencia: string, para: StatusPeriodo): Promise<ModuloResult<{ status: StatusPeriodo }>> {
  if (!compSchema.safeParse(competencia).success) return { success: false, error: 'Competência inválida.' }
  if (!['ABERTO', 'EM_REVISAO', 'APROVADO', 'PAGO'].includes(para)) return { success: false, error: 'Status inválido.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { data, error } = await c.supabase.rpc('comissao_periodo_transicionar', { p_loja_id: c.lojaId, p_competencia: `${competencia}-01`, p_para: para })
  if (error) return { success: false, error: mensagemErroComSecao('Fechamento de comissões', error.message) }
  revalidatePath('/admin/comissoes/fechamento')
  return { success: true, data: { status: ((data as { status?: StatusPeriodo } | null)?.status ?? para) } }
}
