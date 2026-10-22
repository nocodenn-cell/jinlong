'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ROUTES } from '@/lib/navigation/routes'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionImportacoes } from '@/lib/import/hub/gateImportacoes'
import { buscarProdutos, type Opcao } from '@/lib/import/hub/dadosImportacoes'
import { normalizarDecimal } from '@/lib/import/hub/decimais'
import { chaveErro } from '@/lib/import/hub/elegibilidade'
import { erroEntradaLegivel } from '@/lib/import/hub/mensagensMotor'
import { aprovarApuracao, apurarOperacao, type ClienteServico } from '@/lib/import/importIntelligence'
import { quantidadeEstoqueConsistente } from '@shared-core/src/import'

/**
 * Server actions do hub de Importações (Import Intelligence).
 * Toda action: gate no servidor (perfil + licença + vínculo + papel) → validação → RPC com a
 * sessão do usuário (o banco revalida tenant, papel, loja e estado). Nenhuma escrita em estoque,
 * contas a pagar, preços ou cadastro de produto.
 */

export type ResultadoAcao<T = undefined> = { ok: true; data: T } | { ok: false; erro: string; detalhe?: string }

const Uuid = z.string().uuid()
const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional().nullable()
const Moeda = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/)
const TextoOpc = z.string().max(500).optional().nullable()

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }

function falha(erro: string, detalhe?: string): { ok: false; erro: string; detalhe?: string } {
  return { ok: false, erro, ...(detalhe ? { detalhe } : {}) }
}

function revalidar(opId?: string) {
  revalidatePath(ROUTES.admin.importacoes)
  if (opId) revalidatePath(`${ROUTES.admin.importacoes}/${opId}`)
}

async function chamar(client: unknown, fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; erro: string }> {
  const { data, error } = await (client as Rpc).rpc(fn, args)
  if (error) return { ok: false, erro: chaveErro(error.message) }
  return { ok: true, data }
}

/** Vínculo item↔documento atual (RLS da sessão). Erro de leitura é reportado, nunca tratado como "sem vínculo". */
async function documentoDoItem(client: unknown, itemId: string): Promise<{ ok: true; documento_id: string | null } | { ok: false }> {
  const { data, error } = await (client as LeituraDocumento)
    .from('import_itens').select('id, documento_id').eq('id', itemId).maybeSingle()
  if (error) return { ok: false }
  return { ok: true, documento_id: data?.documento_id ?? null }
}

type LeituraDocumento = {
  from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: { documento_id: string | null } | null; error: { message: string } | null }> } } }
}

type LeituraItens = {
  from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => PromiseLike<{ data: { id: string; descricao: string }[] | null }> } }
}

/** Nomes dos itens (RLS da sessão) para trocar UUID por descrição nas mensagens do motor. */
async function itensDaOperacao(client: unknown, operacaoId: string): Promise<{ id: string; descricao: string }[]> {
  try {
    const { data } = await (client as LeituraItens).from('import_itens').select('id, descricao').eq('operacao_id', operacaoId)
    return data ?? []
  } catch {
    return []
  }
}

/** Decimal obrigatório/opcional com a escala do motor; null = inválido. */
function dec(v: unknown, casas: number, opts: { opcional?: boolean; negativo?: boolean } = {}): string | null | undefined {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v)
  if (!s.trim()) return opts.opcional ? undefined : null
  return normalizarDecimal(s, casas, { permitirNegativo: opts.negativo })
}

// ---------------------------------------------------------------- cabeçalho --
const CabecalhoSchema = z.object({
  referencia: z.string().trim().min(1).max(80),
  fornecedor_id: Uuid.or(z.literal('')).optional().nullable(),
  moeda: Moeda.or(z.literal('')).optional().nullable(),
  data_invoice: Data,
  data_embarque: Data,
  data_desembaraco: Data,
  observacoes: TextoOpc,
})
export type CabecalhoInput = z.input<typeof CabecalhoSchema>

export async function criarImportacaoAction(
  input: CabecalhoInput & { loja_importadora_id: string },
): Promise<ResultadoAcao<{ id: string }>> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  const loja = Uuid.safeParse(input.loja_importadora_id)
  const cab = CabecalhoSchema.safeParse(input)
  if (!loja.success || !cab.success) return falha('erro_valor_invalido')

  // tenant derivado da loja no banco; empresa nunca vem do navegador
  const criado = await chamar(gate.ctx.client, 'import_criar_operacao', {
    p_loja_importadora: loja.data,
    p_referencia: cab.data.referencia,
    p_descricao: cab.data.observacoes ?? null,
  })
  if (!criado.ok) return falha(criado.erro)
  const id = String(criado.data)
  const atual = await chamar(gate.ctx.client, 'import_atualizar_operacao', { p_operacao: id, p_dados: cab.data })
  if (!atual.ok) return falha(atual.erro)
  revalidar(id)
  return { ok: true, data: { id } }
}

export async function salvarCabecalhoAction(operacaoId: string, input: CabecalhoInput): Promise<ResultadoAcao> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  const id = Uuid.safeParse(operacaoId)
  const cab = CabecalhoSchema.safeParse(input)
  if (!id.success || !cab.success) return falha('erro_valor_invalido')
  const r = await chamar(gate.ctx.client, 'import_atualizar_operacao', { p_operacao: id.data, p_dados: cab.data })
  if (!r.ok) return falha(r.erro)
  revalidar(id.data)
  return { ok: true, data: undefined }
}

// -------------------------------------------------------------------- itens --
export type ItemInput = {
  id?: string | null
  descricao: string
  codigo_fornecedor?: string | null
  ncm?: string | null
  produto_id?: string | null
  moeda: string
  valor_mercadoria_moeda: string
  valor_aduaneiro_brl?: string | null
  quantidade_comercial: string
  unidade_comercial: string
  fator_para_estoque: string
  quantidade_estoque: string
  peso_liquido_kg?: string | null
  peso_bruto_kg?: string | null
  volume_m3?: string | null
}

export async function salvarItemAction(operacaoId: string, input: ItemInput): Promise<ResultadoAcao<{ id: string }>> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  const op = Uuid.safeParse(operacaoId)
  if (!op.success) return falha('erro_valor_invalido')
  if (input.id && !Uuid.safeParse(input.id).success) return falha('erro_valor_invalido')
  if (input.produto_id && !Uuid.safeParse(input.produto_id).success) return falha('erro_valor_invalido')
  const ncm = (input.ncm ?? '').replace(/\D/g, '')
  if (ncm && ncm.length !== 8) return falha('erro_valor_invalido', 'NCM')
  const moeda = Moeda.safeParse(input.moeda)
  const descricao = (input.descricao ?? '').trim()
  const unidade = (input.unidade_comercial ?? '').trim()
  const campos = {
    valor_mercadoria_moeda: dec(input.valor_mercadoria_moeda, 6),
    valor_aduaneiro_brl: dec(input.valor_aduaneiro_brl, 6, { opcional: true }),
    quantidade_comercial: dec(input.quantidade_comercial, 3),
    fator_para_estoque: dec(input.fator_para_estoque, 6),
    quantidade_estoque: dec(input.quantidade_estoque, 3),
    peso_liquido_kg: dec(input.peso_liquido_kg, 3, { opcional: true }),
    peso_bruto_kg: dec(input.peso_bruto_kg, 3, { opcional: true }),
    volume_m3: dec(input.volume_m3, 3, { opcional: true }),
  }
  const invalido = Object.entries(campos).find(([, v]) => v === null)
  if (!moeda.success || !descricao || !unidade || invalido) return falha('erro_valor_invalido', invalido?.[0])
  // mesma regra do motor (LANDED_QTD_FATOR_INCONSISTENTE): barra no save, não só na simulação
  const { quantidade_comercial: qc, fator_para_estoque: fe, quantidade_estoque: qe } = campos as Record<string, string>
  if (!quantidadeEstoqueConsistente(qc, fe, qe)) return falha('erro_qtd_fator', `"${descricao}": ${qc} × ${fe} ≠ ${qe}`)

  const item = {
    ...(input.id ? { id: input.id } : {}),
    descricao,
    // código do fornecedor é TEXTO: zeros à esquerda preservados (só remove espaços das pontas)
    codigo_fornecedor: (input.codigo_fornecedor ?? '').trim() || null,
    ncm: ncm || null,
    produto_id: input.produto_id || null,
    moeda: moeda.data,
    unidade_comercial: unidade,
    ...Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v ?? null])),
  }
  // import_salvar_item regrava documento_id a partir de p_item: sem reenviar o vínculo atual, a edição o apagaria.
  const doc = input.id ? await documentoDoItem(gate.ctx.client, input.id) : { ok: true as const, documento_id: null }
  if (!doc.ok) return falha('erro_generico')
  const r = await chamar(gate.ctx.client, 'import_salvar_item', { p_operacao: op.data, p_item: { ...item, documento_id: doc.documento_id } })
  if (!r.ok) return falha(r.erro)
  revalidar(op.data)
  return { ok: true, data: { id: String(r.data) } }
}

// --------------------------------------------------------------- lançamentos --
export type TipoLancamento = 'CAMBIO' | 'DESPESA' | 'DESCONTO' | 'TRIBUTO'

export async function salvarLancamentoAction(
  operacaoId: string,
  tipo: TipoLancamento,
  input: Record<string, string | boolean | null | undefined>,
): Promise<ResultadoAcao<{ id: string }>> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  const op = Uuid.safeParse(operacaoId)
  if (!op.success || !['CAMBIO', 'DESPESA', 'DESCONTO', 'TRIBUTO'].includes(tipo)) return falha('erro_valor_invalido')
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string).trim() : '')
  const idOpc = (k: string) => {
    const v = s(k)
    return v ? (Uuid.safeParse(v).success ? v : 'INVALIDO') : null
  }
  if (idOpc('id') === 'INVALIDO' || idOpc('item_id') === 'INVALIDO') return falha('erro_valor_invalido')

  let dados: Record<string, unknown>
  if (tipo === 'CAMBIO') {
    const taxa = dec(s('taxa'), 10)
    if (!taxa || !Moeda.safeParse(s('moeda')).success || !/^\d{4}-\d{2}-\d{2}$/.test(s('data'))) return falha('erro_valor_invalido')
    dados = { moeda: s('moeda').toUpperCase(), taxa, fonte: s('fonte'), data: s('data') }
  } else if (tipo === 'DESPESA') {
    const valor = dec(s('valor'), 6, { negativo: true })
    if (!valor || !Moeda.safeParse(s('moeda')).success || !s('tipo')) return falha('erro_valor_invalido')
    const modo = s('atribuicao_modo')
    dados = {
      tipo: s('tipo'), moeda: s('moeda').toUpperCase(), valor, incorporavel: s('incorporavel'),
      atribuicao_modo: modo, item_id: modo === 'DIRETA' ? idOpc('item_id') : null,
      criterio: modo === 'RATEIO' ? s('criterio') : null, justificativa: s('justificativa'),
    }
  } else if (tipo === 'DESCONTO') {
    const valor = dec(s('valor'), 6)
    if (!valor || !Moeda.safeParse(s('moeda')).success) return falha('erro_valor_invalido')
    const escopo = s('escopo')
    dados = {
      escopo, moeda: s('moeda').toUpperCase(), valor, item_id: escopo === 'ITEM' ? idOpc('item_id') : null,
      criterio: escopo === 'PROCESSO' ? s('criterio') : null, justificativa: s('justificativa'),
    }
  } else {
    const valor = dec(s('valor_apurado_brl'), 2)
    if (!valor || !s('tributo_codigo')) return falha('erro_valor_invalido')
    const regra = s('regra_id')
    dados = {
      tributo_codigo: s('tributo_codigo').toUpperCase(), status_recuperabilidade: s('status_recuperabilidade'),
      valor_apurado_brl: valor, item_id: idOpc('item_id'),
      regra_id: regra || null,
      regra_incorpora_custo: regra ? input.regra_incorpora_custo === true || s('regra_incorpora_custo') === 'true' : null,
      regra_vigencia_inicio: regra ? s('regra_vigencia_inicio') || null : null,
      regra_vigencia_fim: regra ? s('regra_vigencia_fim') || null : null,
      data_fato_gerador: s('data_fato_gerador') || null, validado_por: s('validado_por') || null,
    }
  }
  const id = idOpc('id')
  // documento de origem (opcional): precisa ser um documento DESTA operação, visível sob RLS
  const documentoId = idOpc('documento_id')
  if (documentoId === 'INVALIDO') return falha('erro_valor_invalido')
  if (documentoId) {
    const { data: doc } = await (gate.ctx.client as unknown as { from: (t: string) => { select: (c: string) => { eq: (a: string, b: string) => { eq: (a: string, b: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } } } } })
      .from('import_documentos').select('id').eq('id', documentoId).eq('operacao_id', op.data).maybeSingle()
    if (!doc) return falha('erro_valor_invalido', 'documento')
  }
  const r = await chamar(gate.ctx.client, 'import_salvar_lancamento', {
    p_operacao: op.data, p_tipo: tipo, p_dados: { ...(id ? { id } : {}), ...dados, documento_id: documentoId },
  })
  if (!r.ok) return falha(r.erro)
  revalidar(op.data)
  return { ok: true, data: { id: String(r.data) } }
}

export async function removerRascunhoAction(
  operacaoId: string,
  tipo: 'ITEM' | TipoLancamento,
  id: string,
): Promise<ResultadoAcao> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  if (!Uuid.safeParse(operacaoId).success || !Uuid.safeParse(id).success) return falha('erro_valor_invalido')
  const r = await chamar(gate.ctx.client, 'import_remover_rascunho', { p_operacao: operacaoId, p_tipo: tipo, p_id: id })
  if (!r.ok) return falha(r.erro)
  revalidar(operacaoId)
  return { ok: true, data: undefined }
}

export async function conferirLancamentoAction(
  operacaoId: string,
  tipo: 'DESPESA' | 'TRIBUTO',
  id: string,
  status: 'PENDENTE' | 'CONFERIDO',
): Promise<ResultadoAcao> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  if (!Uuid.safeParse(operacaoId).success || !Uuid.safeParse(id).success) return falha('erro_valor_invalido')
  const r = await chamar(gate.ctx.client, 'import_conferir_lancamento', {
    p_operacao: operacaoId, p_tipo: tipo, p_id: id, p_status: status,
  })
  if (!r.ok) return falha(r.erro)
  revalidar(operacaoId)
  return { ok: true, data: undefined }
}

// ---------------------------------------------------------------- documentos --
const DocumentoSchema = z.object({
  tipo: z.enum(['INVOICE', 'PACKING_LIST', 'CONHECIMENTO_EMBARQUE', 'DI', 'DUIMP', 'NFE', 'COMPROVANTE_PAGAMENTO', 'CONTRATO_CAMBIO', 'OUTRO']),
  numero: z.string().trim().max(120).optional().nullable(),
  data_documento: Data,
  substitui: Uuid.or(z.literal('')).optional().nullable(),
})

/** Só a REFERÊNCIA documental: upload de arquivo fica indisponível até a retenção ser aprovada (D8). */
export async function registrarDocumentoAction(
  operacaoId: string,
  input: { tipo: string; numero?: string | null; data_documento?: string | null; substitui?: string | null },
): Promise<ResultadoAcao> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  const d = DocumentoSchema.safeParse(input)
  if (!Uuid.safeParse(operacaoId).success || !d.success) return falha('erro_valor_invalido')
  const r = await chamar(gate.ctx.client, 'import_registrar_documento', {
    p_operacao: operacaoId, p_tipo: d.data.tipo, p_numero: d.data.numero || null, p_data: d.data.data_documento || null,
    p_storage_path: null, p_sha256: null, p_tamanho: null, p_mime: null, p_substitui: d.data.substitui || null,
  })
  if (!r.ok) return falha(r.erro)
  revalidar(operacaoId)
  return { ok: true, data: undefined }
}

// ----------------------------------------------------------------- apuração --
export async function apurarAction(
  operacaoId: string,
  tipo: 'SIMULACAO' | 'APURACAO',
): Promise<ResultadoAcao<{ apuracaoId: string; status: 'OK' | 'BLOQUEADO' }>> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  if (!Uuid.safeParse(operacaoId).success || !['SIMULACAO', 'APURACAO'].includes(tipo)) return falha('erro_valor_invalido')
  // motor existente (shared-core) sobre a entrada montada pelo banco
  const r = await apurarOperacao(gate.ctx.client, operacaoId, tipo)
  if (!r.ok) {
    if (r.motivo === 'ENTRADA_INVALIDA') {
      const e = erroEntradaLegivel(r.detalhe, await itensDaOperacao(gate.ctx.client, operacaoId))
      return falha(e.erro, e.detalhe)
    }
    return falha(r.motivo === 'MODULO_NEGADO' ? 'erro_nao_autorizado' : chaveErro(r.detalhe))
  }
  revalidar(operacaoId)
  return { ok: true, data: { apuracaoId: r.apuracaoId, status: r.status } }
}

export async function aprovarAction(operacaoId: string, apuracaoId: string, motivo: string): Promise<ResultadoAcao> {
  const gate = await actionImportacoes({ somenteDono: true })
  if (!gate.ok) return falha('erro_nao_autorizado')
  if (!Uuid.safeParse(operacaoId).success || !Uuid.safeParse(apuracaoId).success) return falha('erro_valor_invalido')
  if ((motivo ?? '').trim().length < 10) return falha('erro_motivo')
  // servidor recalcula e confere; o banco revalida o DONO (estado do navegador é irrelevante)
  const r = await aprovarApuracao(gate.ctx.client, createAdminClient() as unknown as ClienteServico, apuracaoId, motivo.trim())
  if (!r.ok) {
    if (r.motivo === 'RECALCULO_DIVERGENTE') return falha('erro_recalculo')
    if (r.motivo === 'NAO_APROVAVEL') return falha('erro_generico', r.detalhe)
    return falha(r.motivo === 'MODULO_NEGADO' ? 'erro_nao_autorizado' : chaveErro(r.detalhe))
  }
  revalidar(operacaoId)
  return { ok: true, data: undefined }
}

export async function mudarEstadoAction(operacaoId: string, acao: 'REABRIR' | 'CANCELAR', motivo: string): Promise<ResultadoAcao> {
  const gate = await actionImportacoes({ somenteDono: acao === 'REABRIR' })
  if (!gate.ok) return falha('erro_nao_autorizado')
  if (!Uuid.safeParse(operacaoId).success || !['REABRIR', 'CANCELAR'].includes(acao)) return falha('erro_valor_invalido')
  if ((motivo ?? '').trim().length < 10) return falha('erro_motivo')
  const r = await chamar(gate.ctx.client, 'import_mudar_estado', { p_operacao: operacaoId, p_acao: acao, p_motivo: motivo.trim() })
  if (!r.ok) return falha(r.erro)
  revalidar(operacaoId)
  return { ok: true, data: undefined }
}

export async function buscarProdutosAction(termo: string): Promise<ResultadoAcao<Opcao[]>> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  return { ok: true, data: await buscarProdutos(gate.ctx.client, String(termo ?? '').slice(0, 80)) }
}
