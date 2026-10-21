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

// ── P2: configuração, metas, divisão, exportação, autoatendimento ─────────────
export type ConfigComissao = { base: 'LIQUIDA' | 'BRUTA'; liberacao: 'VENDA' | 'RECEBIMENTO' }
export type FaixaMeta = { aPartirDe: number; bonusPct: number }
export type MetaComissao = {
  id: string; usuarioId: string | null; usuarioNome: string | null; cargo: string | null
  competenciaInicio: string; competenciaFim: string | null; faixas: FaixaMeta[]; ativo: boolean; descricao: string | null
}
export type VendaDivisao = {
  vendaId: string; data: string; operadorNome: string; valorComissao: number
  secundarioId: string | null; secundarioNome: string | null; percentual: number | null
}

export async function painelMetasComissao(): Promise<ModuloResult<{
  config: ConfigComissao; metas: MetaComissao[]; vendas: VendaDivisao[]; vendedores: { id: string; nome: string }[]
}>> {
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const empresaId = await empresaDaLoja(c)
  if (!empresaId) return { success: false, error: 'Empresa não encontrada.' }
  const [cfg, metas, cvs, vend] = await Promise.all([
    c.supabase.from('comissoes_config').select('base, liberacao').eq('empresa_id', empresaId).maybeSingle(),
    c.supabase.from('comissoes_metas').select('*, usuarios:usuario_id(nome)').eq('empresa_id', empresaId).order('competencia_inicio', { ascending: false }),
    c.supabase.from('comissoes_vendedores').select('venda_id, valor_comissao, created_at, usuarios:operador_id(nome)')
      .eq('loja_id', c.lojaId).order('created_at', { ascending: false }).limit(50),
    c.supabase.rpc('listar_vendedores_loja', { p_loja_id: c.lojaId }),
  ])
  if (metas.error) return { success: false, error: mensagemErroComSecao('Metas', metas.error.message) }
  const ids = (cvs.data ?? []).map((r) => r.venda_id)
  const divs = ids.length
    ? await c.supabase.from('comissoes_divisoes').select('venda_id, percentual, operador_secundario_id, usuarios:operador_secundario_id(nome)').in('venda_id', ids)
    : { data: [] as never[] }
  type Div = { venda_id: string; percentual: number; operador_secundario_id: string; usuarios?: { nome: string } | null }
  const porVenda = new Map(((divs.data ?? []) as unknown as Div[]).map((d) => [d.venda_id, d]))
  type MetaRow = { id: string; usuario_id: string | null; cargo: string | null; competencia_inicio: string; competencia_fim: string | null; faixas: unknown; ativo: boolean; descricao: string | null; usuarios?: { nome: string } | null }
  return {
    success: true,
    data: {
      config: { base: (cfg.data?.base as ConfigComissao['base']) ?? 'LIQUIDA', liberacao: (cfg.data?.liberacao as ConfigComissao['liberacao']) ?? 'VENDA' },
      metas: ((metas.data ?? []) as unknown as MetaRow[]).map((m) => ({
        id: m.id, usuarioId: m.usuario_id, usuarioNome: m.usuarios?.nome ?? null, cargo: m.cargo,
        competenciaInicio: m.competencia_inicio.slice(0, 7), competenciaFim: m.competencia_fim?.slice(0, 7) ?? null,
        faixas: ((m.faixas as Array<{ a_partir_de: number; bonus_pct: number }>) ?? []).map((f) => ({ aPartirDe: Number(f.a_partir_de), bonusPct: Number(f.bonus_pct) })),
        ativo: m.ativo, descricao: m.descricao,
      })),
      vendas: ((cvs.data ?? []) as unknown as Array<{ venda_id: string; valor_comissao: number; created_at: string; usuarios?: { nome: string } | null }>).map((r) => {
        const d = porVenda.get(r.venda_id)
        return {
          vendaId: r.venda_id, data: r.created_at, operadorNome: r.usuarios?.nome ?? '—', valorComissao: Number(r.valor_comissao),
          secundarioId: d?.operador_secundario_id ?? null, secundarioNome: d?.usuarios?.nome ?? null, percentual: d ? Number(d.percentual) : null,
        }
      }),
      vendedores: ((vend.data ?? []) as Array<{ id: string | null; nome: string | null }>).filter((v): v is { id: string; nome: string | null } => !!v.id).map((v) => ({ id: v.id, nome: v.nome ?? '—' })),
    },
  }
}

export async function salvarConfigComissao(cfg: ConfigComissao): Promise<ModuloResult<ConfigComissao>> {
  const p = z.object({ base: z.enum(['LIQUIDA', 'BRUTA']), liberacao: z.enum(['VENDA', 'RECEBIMENTO']) }).safeParse(cfg)
  if (!p.success) return { success: false, error: 'Configuração inválida.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { error } = await c.supabase.rpc('comissao_salvar_config', { p_loja_id: c.lojaId, p_base: p.data.base, p_liberacao: p.data.liberacao })
  if (error) return { success: false, error: mensagemErroComSecao('Configuração de comissão', error.message) }
  revalidatePath('/admin/comissoes/metas')
  return { success: true, data: p.data }
}

const metaSchema = z.object({
  id: z.string().uuid().optional(),
  usuarioId: z.string().uuid().nullable(),
  cargo: z.string().trim().max(80).nullable(),
  competenciaInicio: compSchema,
  competenciaFim: compSchema.nullable(),
  faixas: z.array(z.object({ aPartirDe: z.number().finite().min(0), bonusPct: z.number().finite().min(0).max(100) })).min(1).max(10)
    .refine((fs) => fs.every((f, i) => i === 0 || f.aPartirDe > fs[i - 1].aPartirDe), { message: 'Faixas devem estar em ordem crescente.' }),
  ativo: z.boolean(),
  descricao: z.string().trim().max(200).nullable(),
}).refine((m) => !(m.usuarioId && m.cargo), { message: 'Escolha funcionário OU cargo.' })
  .refine((m) => !m.competenciaFim || m.competenciaFim >= m.competenciaInicio, { message: 'Fim antes do início.' })
export type MetaInput = z.input<typeof metaSchema>

export async function salvarMetaComissao(input: MetaInput): Promise<ModuloResult<{ id: string }>> {
  const p = metaSchema.safeParse(input)
  if (!p.success) return { success: false, error: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const empresaId = await empresaDaLoja(c)
  if (!empresaId) return { success: false, error: 'Empresa não encontrada.' }
  const m = p.data
  const row = {
    empresa_id: empresaId, usuario_id: m.usuarioId, cargo: m.cargo ? m.cargo.toLowerCase() : null,
    competencia_inicio: `${m.competenciaInicio}-01`, competencia_fim: m.competenciaFim ? `${m.competenciaFim}-01` : null,
    faixas: m.faixas.map((f) => ({ a_partir_de: f.aPartirDe, bonus_pct: f.bonusPct })), ativo: m.ativo, descricao: m.descricao || null,
  }
  const { data, error } = m.id
    ? await c.supabase.from('comissoes_metas').update(row).eq('id', m.id).select('id').single()
    : await c.supabase.from('comissoes_metas').insert(row).select('id').single()
  if (error) return { success: false, error: mensagemErroComSecao('Metas', error.message) }
  revalidatePath('/admin/comissoes/metas')
  return { success: true, data: { id: data.id } }
}

export async function excluirMetaComissao(id: string): Promise<ModuloResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: 'Meta inválida.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { error } = await c.supabase.from('comissoes_metas').delete().eq('id', id)
  if (error) return { success: false, error: mensagemErroComSecao('Metas', error.message) }
  revalidatePath('/admin/comissoes/metas')
  return { success: true, data: null }
}

export async function definirDivisaoComissao(vendaId: string, segundoId: string | null, percentual: number): Promise<ModuloResult<null>> {
  if (!z.string().uuid().safeParse(vendaId).success || (segundoId !== null && !z.string().uuid().safeParse(segundoId).success))
    return { success: false, error: 'Dados inválidos.' }
  if (!(percentual > 0 && percentual < 100)) return { success: false, error: 'Percentual entre 1 e 99.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { error } = await c.supabase.rpc('definir_divisao_comissao', { p_venda_id: vendaId, p_segundo_id: segundoId as string, p_percentual: percentual })
  if (error) return { success: false, error: mensagemErroComSecao('Divisão de comissão', error.message) }
  revalidatePath('/admin/comissoes/metas')
  return { success: true, data: null }
}

export type LinhaExportContabil = {
  competencia: string; lojaCodigo: string | null; lojaNome: string; operadorId: string; operadorNome: string; status: string
  base: number; comissao: number; ajustes: number; bonusMeta: number; total: number; aprovadoEm: string | null
}
export async function exportContabilComissao(competencia: string): Promise<ModuloResult<LinhaExportContabil[]>> {
  if (!compSchema.safeParse(competencia).success) return { success: false, error: 'Competência inválida.' }
  const c = await ctxGestor()
  if (!c.ok) return { success: false, error: c.error }
  const { data, error } = await c.supabase.rpc('comissao_export_contabil', { p_loja_id: c.lojaId, p_competencia: `${competencia}-01` })
  if (error) return { success: false, error: mensagemErroComSecao('Exportação contábil', error.message) }
  return {
    success: true,
    data: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      competencia: String(r.competencia).slice(0, 7), lojaCodigo: (r.loja_codigo as string | null) ?? null, lojaNome: String(r.loja_nome),
      operadorId: String(r.operador_id), operadorNome: String(r.operador_nome), status: String(r.status_periodo),
      base: Number(r.base), comissao: Number(r.comissao), ajustes: Number(r.ajustes), bonusMeta: Number(r.bonus_meta), total: Number(r.total),
      aprovadoEm: (r.aprovado_em as string | null) ?? null,
    })),
  }
}

/** Autoatendimento: qualquer usuário logado vê SÓ as próprias comissões (RPC filtra por auth.uid()). */
export type MinhaComissaoMes = {
  lojaNome: string; competencia: string; status: StatusPeriodo; vendas: number; base: number; comissao: number; ajustes: number; bonusMeta: number; total: number
}
export async function minhasComissoes(meses = 6): Promise<ModuloResult<MinhaComissaoMes[]>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Sessão expirada.' }
  const { data, error } = await supabase.rpc('minhas_comissoes', { p_meses: Math.min(Math.max(Math.trunc(meses), 1), 24) })
  if (error) return { success: false, error: mensagemErroComSecao('Minhas comissões', error.message) }
  return {
    success: true,
    data: ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      lojaNome: String(r.loja_nome), competencia: String(r.competencia).slice(0, 7), status: r.status_periodo as StatusPeriodo,
      vendas: Number(r.vendas), base: Number(r.base), comissao: Number(r.comissao), ajustes: Number(r.ajustes), bonusMeta: Number(r.bonus_meta), total: Number(r.total),
    })),
  }
}
