import 'server-only'
import type { LandedCostOutput } from '@shared-core/src/import'
import type { ClienteImport } from '@/lib/import/importIntelligence'

/**
 * Leituras do hub de Importações, sempre com a sessão do usuário (RLS do Import Intelligence:
 * licença + vínculo + papel + loja). Valores numéricos são lidos como TEXTO (`::text`) para
 * nunca passar por float. Nenhuma escrita aqui.
 */

type Resp<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>
type Consulta<T> = Resp<T[]> & {
  eq: (c: string, v: string) => Consulta<T>
  in: (c: string, v: readonly string[]) => Consulta<T>
  order: (c: string, o?: { ascending?: boolean }) => Consulta<T>
  limit: (n: number) => Consulta<T>
  maybeSingle: () => Resp<T>
}
type ClienteLeitura = {
  from: <T>(t: string) => { select: (c: string) => Consulta<T> }
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Resp<T>
}
const leitor = (c: ClienteImport) => c as unknown as ClienteLeitura

export type StatusOperacao = 'RASCUNHO' | 'APROVADA' | 'CANCELADA'

export type OperacaoLista = {
  id: string
  referencia: string
  status: StatusOperacao
  loja_importadora_id: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  moeda: string | null
  data_invoice: string | null
  criado_em: string
  atualizado_em: string
  n_itens: number
  ultima_apuracao_id: string | null
  ultima_apuracao_versao: number | null
  ultima_apuracao_tipo: 'SIMULACAO' | 'APURACAO' | null
  ultima_apuracao_status: 'OK' | 'BLOQUEADO' | null
  ultima_apuracao_atual: boolean | null
  ultima_apuracao_bloqueantes: number
  ultima_apuracao_custo_total: string | null
  aprovada_custo_total: string | null
}

export type Operacao = {
  id: string
  referencia: string
  descricao: string | null
  status: StatusOperacao
  versao_dados: number
  loja_importadora_id: string
  fornecedor_id: string | null
  moeda: string | null
  data_invoice: string | null
  data_embarque: string | null
  data_desembaraco: string | null
  apuracao_aprovada_id: string | null
  criado_por: string
  criado_em: string
  atualizado_em: string
}

export type Item = {
  id: string
  descricao: string
  codigo_fornecedor: string | null
  ncm: string | null
  produto_id: string | null
  moeda: string
  valor_mercadoria_moeda: string
  valor_aduaneiro_brl: string | null
  quantidade_comercial: string
  unidade_comercial: string
  fator_para_estoque: string
  quantidade_estoque: string
  peso_liquido_kg: string | null
  peso_bruto_kg: string | null
  volume_m3: string | null
}

export type Cambio = { id: string; moeda: string; taxa: string; fonte: string; data: string }

export type Despesa = {
  id: string
  tipo: string
  moeda: string
  valor: string
  incorporavel: 'SIM' | 'NAO' | 'DECISAO_03'
  atribuicao_modo: 'DIRETA' | 'RATEIO'
  item_id: string | null
  criterio: string | null
  justificativa: string
  status_conferencia: 'PENDENTE' | 'CONFERIDO'
  documento_id: string | null
}

export type Desconto = {
  id: string
  escopo: 'ITEM' | 'PROCESSO'
  moeda: string
  valor: string
  item_id: string | null
  criterio: string | null
  justificativa: string
  documento_id: string | null
}

export type Tributo = {
  id: string
  tributo_codigo: string
  status_recuperabilidade: string
  valor_apurado_brl: string
  item_id: string | null
  regra_id: string | null
  regra_incorpora_custo: boolean | null
  regra_vigencia_inicio: string | null
  regra_vigencia_fim: string | null
  data_fato_gerador: string | null
  validado_por: string | null
  status_conferencia: 'PENDENTE' | 'CONFERIDO'
  documento_id: string | null
}

export type Documento = {
  id: string
  tipo: string
  numero: string | null
  data_documento: string | null
  storage_path: string | null
  sha256: string | null
  versao: number
  substitui_documento_id: string | null
  enviado_por: string
  enviado_em: string
}

export type ApuracaoResumo = {
  id: string
  versao: number
  tipo: 'SIMULACAO' | 'APURACAO'
  versao_dados: number
  engine_version: string
  status_calculo: 'OK' | 'BLOQUEADO'
  conservacao_ok: boolean
  criado_por: string
  criado_em: string
  saida_sha256: string
}

export type ApuracaoDetalhe = ApuracaoResumo & { saida: LandedCostOutput }

export type Aprovacao = {
  id: string
  apuracao_id: string | null
  decisao: 'APROVADA' | 'REABERTA' | 'CANCELADA'
  por: string
  motivo: string
  em: string
}

export type Auditoria = { id: number; acao: string; entidade: string; por: string | null; em: string }

export type OperacaoCompleta = {
  operacao: Operacao
  lojaNome: string | null
  fornecedorNome: string | null
  itens: Item[]
  cambios: Cambio[]
  despesas: Despesa[]
  descontos: Desconto[]
  tributos: Tributo[]
  documentos: Documento[]
  apuracoes: ApuracaoResumo[]
  aprovacoes: Aprovacao[]
  auditoria: Auditoria[]
  produtos: Record<string, string>
  usuarios: Record<string, string>
}

export type Opcao = { id: string; nome: string }

async function lista<T>(q: Resp<T[]>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function listarOperacoes(client: ClienteImport): Promise<OperacaoLista[]> {
  const { data, error } = await leitor(client).rpc<OperacaoLista[]>('import_listar_operacoes')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ ...r, n_itens: Number(r.n_itens), ultima_apuracao_bloqueantes: Number(r.ultima_apuracao_bloqueantes ?? 0) }))
}

/** Lojas e fornecedores visíveis ao usuário (RLS + cerca de empresa). O banco revalida a escolha. */
export async function opcoesCadastro(client: ClienteImport): Promise<{ lojas: Opcao[]; fornecedores: Opcao[] }> {
  const db = leitor(client)
  const [lojas, fornecedores] = await Promise.all([
    lista(db.from<Opcao>('lojas').select('id, nome').order('nome')),
    lista(db.from<Opcao>('fornecedores').select('id, nome').order('nome').limit(500)),
  ])
  return { lojas, fornecedores }
}

/** Nomes dos produtos vinculados, via RPC do módulo (sem acesso direto à tabela de produtos). */
async function nomesProdutos(db: ClienteLeitura, ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return {}
  const { data } = await db.rpc<Opcao[]>('import_buscar_produtos', { p_termo: null, p_ids: unicos })
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.nome]))
}

async function nomes(db: ClienteLeitura, tabela: 'usuarios', ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return {}
  try {
    const linhas = await lista(db.from<{ id: string; nome: string }>(tabela).select('id, nome').in('id', unicos))
    return Object.fromEntries(linhas.map((l) => [l.id, l.nome]))
  } catch {
    return {}
  }
}

const COLS_ITEM =
  'id, descricao, codigo_fornecedor, ncm, produto_id, moeda, valor_mercadoria_moeda::text, valor_aduaneiro_brl::text, ' +
  'quantidade_comercial::text, unidade_comercial, fator_para_estoque::text, quantidade_estoque::text, ' +
  'peso_liquido_kg::text, peso_bruto_kg::text, volume_m3::text'

/** Operação completa, ou null se não existir ou não for visível para o usuário. */
export async function carregarOperacao(client: ClienteImport, id: string): Promise<OperacaoCompleta | null> {
  const db = leitor(client)
  const { data: operacao, error } = await db
    .from<Operacao>('import_operacoes')
    .select('id, referencia, descricao, status, versao_dados, loja_importadora_id, fornecedor_id, moeda, data_invoice, data_embarque, data_desembaraco, apuracao_aprovada_id, criado_por, criado_em, atualizado_em')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!operacao) return null

  const [itens, cambios, despesas, descontos, tributos, documentos, apuracoes, aprovacoes, auditoria, lojas, fornecedores] =
    await Promise.all([
      lista(db.from<Item>('import_itens').select(COLS_ITEM).eq('operacao_id', id).order('id')),
      lista(db.from<Cambio>('import_cambios').select('id, moeda, taxa::text, fonte, data').eq('operacao_id', id).order('moeda')),
      lista(db.from<Despesa>('import_despesas')
        .select('id, tipo, moeda, valor::text, incorporavel, atribuicao_modo, item_id, criterio, justificativa, status_conferencia, documento_id')
        .eq('operacao_id', id).order('id')),
      lista(db.from<Desconto>('import_descontos')
        .select('id, escopo, moeda, valor::text, item_id, criterio, justificativa, documento_id').eq('operacao_id', id).order('id')),
      lista(db.from<Tributo>('import_tributos')
        .select('id, tributo_codigo, status_recuperabilidade, valor_apurado_brl::text, item_id, regra_id, regra_incorpora_custo, regra_vigencia_inicio, regra_vigencia_fim, data_fato_gerador, validado_por, status_conferencia, documento_id')
        .eq('operacao_id', id).order('id')),
      lista(db.from<Documento>('import_documentos')
        .select('id, tipo, numero, data_documento, storage_path, sha256, versao, substitui_documento_id, enviado_por, enviado_em')
        .eq('operacao_id', id).order('enviado_em', { ascending: false })),
      lista(db.from<ApuracaoResumo>('import_apuracoes')
        .select('id, versao, tipo, versao_dados, engine_version, status_calculo, conservacao_ok, criado_por, criado_em, saida_sha256')
        .eq('operacao_id', id).order('versao', { ascending: false })),
      lista(db.from<Aprovacao>('import_aprovacoes').select('id, apuracao_id, decisao, por, motivo, em').eq('operacao_id', id)
        .order('em', { ascending: false })),
      lista(db.from<Auditoria>('import_auditoria').select('id, acao, entidade, por, em').eq('operacao_id', id)
        .order('em', { ascending: false }).limit(50)),
      lista(db.from<Opcao>('lojas').select('id, nome').eq('id', operacao.loja_importadora_id)),
      operacao.fornecedor_id
        ? lista(db.from<Opcao>('fornecedores').select('id, nome').eq('id', operacao.fornecedor_id))
        : Promise.resolve([] as Opcao[]),
    ])

  const usuarios = await nomes(db, 'usuarios', [
    operacao.criado_por,
    ...apuracoes.map((a) => a.criado_por),
    ...aprovacoes.map((a) => a.por),
    ...auditoria.map((a) => a.por ?? ''),
    ...documentos.map((d) => d.enviado_por),
  ])
  const produtos = await nomesProdutos(db, itens.map((i) => i.produto_id ?? ''))

  return {
    operacao,
    lojaNome: lojas[0]?.nome ?? null,
    fornecedorNome: fornecedores[0]?.nome ?? null,
    itens,
    cambios,
    despesas,
    descontos,
    tributos,
    documentos,
    apuracoes,
    aprovacoes,
    auditoria,
    produtos,
    usuarios,
  }
}

/** Uma apuração com a saída do motor (strings exatas), restrita à operação informada. */
export async function carregarApuracao(
  client: ClienteImport,
  operacaoId: string,
  apuracaoId: string,
): Promise<ApuracaoDetalhe | null> {
  const { data, error } = await leitor(client)
    .from<ApuracaoDetalhe>('import_apuracoes')
    .select('id, versao, tipo, versao_dados, engine_version, status_calculo, conservacao_ok, criado_por, criado_em, saida_sha256, saida')
    .eq('id', apuracaoId)
    .eq('operacao_id', operacaoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? null
}

/** Produtos da empresa para vínculo opcional do item (RPC do módulo: licença + cerca; só id e nome). */
export async function buscarProdutos(client: ClienteImport, termo: string): Promise<Opcao[]> {
  const t = termo.trim()
  if (t.length < 2) return []
  const { data, error } = await leitor(client).rpc<Opcao[]>('import_buscar_produtos', { p_termo: t, p_ids: null })
  if (error) return []
  return data ?? []
}
