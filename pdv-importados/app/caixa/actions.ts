'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { assertSupabasePublicEnv } from '@/lib/supabase/env'
import { mapRegraPrecoRow, type RegraPrecoRow } from '@/core/caixa/mapRegrasPreco'
import type { RegraPreco } from '@/core/pricing/types'
import { pricingService } from '@/core/pricing/PricingService'
import type { ItemCarrinho } from '@/core/cart/types'
import {
  finalizarVendaInputSchema,
  roundMoney2,
  totaisFromItens,
  totalsMatchDeclared,
} from '@/app/caixa/finalizarVendaValidation'
import type { FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'
import { getLojaIdUsuario, LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { DEFAULT_PRICING_CONTEXT, type PricingContext } from '@/core/pricing/types'
import { variantesChaveLeitura } from '@/core/caixa/variantesChaveLeitura'
import {
  mensagemErroComSecao,
  mensagemErroDeExcecao,
  mensagemErroParaUsuario,
  mensagemErroValidacaoZod,
} from '@/lib/errors/mensagemErroUsuario'
import { resolveVendaIdForFinalize } from '@/lib/caixa/resolveVendaIdForFinalize'

export type ProdutoCaixaDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  preco_varejo: number
  preco_atacado: number | null
  categoria_id: string | null
  /** Estoque atual (se houver linha em `estoque`) */
  quantidade_estoque: number | null
}

export type CarregarRegrasResult =
  | { ok: true; regras: RegraPreco[]; pricingContext: PricingContext }
  | { ok: false; error: string }

export type BuscarProdutoResult =
  | { ok: true; status: 'encontrado'; produto: ProdutoCaixaDTO }
  | { ok: true; status: 'nao_encontrado' }
  | { ok: true; status: 'ambiguo'; mensagem: string }
  | { ok: false; error: string }

/** Remove caracteres perigosos para padrão ILIKE. */
function sanitizeIlikeFragment(s: string): string {
  return s.replace(/[%_\\]/g, '').trim()
}

function mapProdutoRow(
  r: {
    id: string
    nome: string
    codigo_barras: string | null
    preco_varejo: number | string
    preco_atacado?: number | string | null
    categoria_id: string | null
  },
  quantidade_estoque: number | null,
): ProdutoCaixaDTO {
  const pa = r.preco_atacado
  return {
    id: r.id,
    nome: r.nome,
    codigo_barras: r.codigo_barras,
    preco_varejo: Number(r.preco_varejo),
    preco_atacado: pa === null || pa === undefined ? null : Number(pa),
    categoria_id: r.categoria_id,
    quantidade_estoque,
  }
}

const PRODUTO_COLS =
  'id, nome, codigo_barras, preco_varejo, preco_atacado, categoria_id' as const

type PdvConfigCaixaWebRow = {
  quantidade_minima_atacado_padrao: number
  blind_closure: boolean
}

/** Campos não sensíveis de `pdv_config` (migration 058 — tabela sem SELECT direto para authenticated). */
async function fetchPdvConfigParaCaixaWeb(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<
  { ok: true; row: PdvConfigCaixaWebRow | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('pdv_config_para_caixa_web')
  if (error) return { ok: false, error: mensagemErroParaUsuario(error.message) }
  const rows = data as PdvConfigCaixaWebRow[] | null | undefined
  const row = rows?.[0] ?? null
  return { ok: true, row }
}

async function quantidadeEstoque(
  supabase: Awaited<ReturnType<typeof createClient>>,
  produtoId: string,
  lojaId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('estoque')
    .select('quantidade_atual')
    .eq('produto_id', produtoId)
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (!data || data.quantidade_atual === undefined || data.quantidade_atual === null) {
    return null
  }
  return Number(data.quantidade_atual)
}

/**
 * Regras ativas para o motor de preço no caixa (`regras_preco` via RLS; limiares em `pdv_config` via RPC).
 */
export async function carregarRegrasPrecoCaixa(): Promise<CarregarRegrasResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data, error } = await supabase
      .from('regras_preco')
      .select(
        'id, tipo_regra, produto_id, categoria_id, quantidade_minima, quantidade_maxima, tipo_desconto, valor_desconto, data_validade, ativo',
      )
      .eq('ativo', true)

    if (error) {
      return { ok: false, error: mensagemErroParaUsuario(error.message) }
    }

    const cfgRes = await fetchPdvConfigParaCaixaWeb(supabase)
    if (!cfgRes.ok) {
      return { ok: false, error: cfgRes.error }
    }
    const minAtacado = cfgRes.row?.quantidade_minima_atacado_padrao
      ? Number(cfgRes.row.quantidade_minima_atacado_padrao)
      : DEFAULT_PRICING_CONTEXT.quantidadeMinimaAtacadoPadrao

    const regras = (data as RegraPrecoRow[] | null)?.map(mapRegraPrecoRow) ?? []
    return {
      ok: true,
      regras,
      pricingContext: { quantidadeMinimaAtacadoPadrao: minAtacado },
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar as regras de preço.'),
    }
  }
}

/**
 * 1) Código de barras: mesmas variantes que o pdv-local (trim, dígitos, zeros à esquerda, cortes EAN).
 * 2) Nome ILIKE (ativo); se mais de um resultado, pede refinamento.
 */
export async function buscarProdutoParaCaixa(termo: string): Promise<BuscarProdutoResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID

    const t = termo.trim()
    if (!t) return { ok: true, status: 'nao_encontrado' }

    const variantes = variantesChaveLeitura(t)
    if (variantes.length > 0) {
      const { data: porCodigoLista, error: errCodigo } = await supabase
        .from('produtos')
        .select(PRODUTO_COLS)
        .eq('ativo', true)
        .in('codigo_barras', variantes)
        .limit(10)

      if (errCodigo) return { ok: false, error: mensagemErroParaUsuario(errCodigo.message) }
      const listaCod = porCodigoLista ?? []
      if (listaCod.length > 0) {
        const ids = new Set(listaCod.map((r) => r.id))
        if (ids.size > 1) {
          return {
            ok: true,
            status: 'ambiguo',
            mensagem:
              'Vários produtos batem com o código lido. Use o nome ou corrija códigos duplicados no cadastro.',
          }
        }
        const row = listaCod[0]
        const q = await quantidadeEstoque(supabase, row.id, lojaId)
        return {
          ok: true,
          status: 'encontrado',
          produto: mapProdutoRow(row, q),
        }
      }
    }

    const frag = sanitizeIlikeFragment(t)
    if (frag.length < 2) {
      return { ok: true, status: 'nao_encontrado' }
    }

    const { data: porNome, error: errNome } = await supabase
      .from('produtos')
      .select(PRODUTO_COLS)
      .eq('ativo', true)
      .ilike('nome', `%${frag}%`)
      .limit(3)

    if (errNome) return { ok: false, error: mensagemErroParaUsuario(errNome.message) }
    const lista = porNome ?? []
    if (lista.length === 0) return { ok: true, status: 'nao_encontrado' }
    if (lista.length > 1) {
      return {
        ok: true,
        status: 'ambiguo',
        mensagem: `Vários produtos batem com “${frag}”. Use o código de barras ou refine o nome.`,
      }
    }

    const row = lista[0]
    const q = await quantidadeEstoque(supabase, row.id, lojaId)
    return {
      ok: true,
      status: 'encontrado',
      produto: mapProdutoRow(row, q),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível buscar o produto. Tente de novo.'),
    }
  }
}

export type FinalizarVendaCaixaResult =
  | { ok: true; vendaId: string }
  | { ok: false; error: string }

type PagamentoParcelaRpc = {
  forma_pagamento: FinalizarVendaInput['formaPagamento']
  valor: number
}

export type CaixaStatusOperadorResult =
  | {
      ok: true
      aberto: true
      caixaId: string
      dataAbertura: string
      valorInicial: number
      valorSistemaDinheiro: number
      blindClosureEnabled: boolean
    }
  | { ok: true; aberto: false }
  | { ok: false; error: string }

export type AbrirCaixaOperadorResult =
  | { ok: true; caixaId: string }
  | { ok: false; error: string }

export type FecharCaixaOperadorResult =
  | {
      ok: true
      caixaId: string
      valorSistemaDinheiro: number
      valorContado: number
      diferenca: number
    }
  | { ok: false; error: string }

export type ValidarGerenteDescontoResult =
  | { ok: true; token: string; expiraEm: string; maxDescontoPercentual: number; gerenteId: string }
  | { ok: false; error: string; scope?: string; lockUntil?: string }

export type LimiteSangriaResult =
  | { ok: true; limite: number }
  | { ok: false; error: string }

export type TipoMovimentacaoCaixa = 'suprimento' | 'sangria' | 'estorno'
export type FormaMovimentacaoCaixa =
  | 'dinheiro'
  | 'pix'
  | 'cartao_debito'
  | 'cartao_credito'
  | 'outro'
export type StatusMovimentacaoCaixa = 'pendente' | 'aprovado' | 'cancelado'

export type RegistrarMovimentacaoInput = {
  caixaId: string
  tipo: TipoMovimentacaoCaixa
  formaPagamento: FormaMovimentacaoCaixa
  valor: number
  motivo: string
  motivoCodigo?: string
  status?: StatusMovimentacaoCaixa
  movimentacaoOrigemId?: string
  idempotencyKey: string
  gerenteId?: string
  deviceId?: string
  terminalId?: string
}

export type RegistrarMovimentacaoResult =
  | { ok: true; movimentacaoId: string; status: StatusMovimentacaoCaixa; saldoAtual: number }
  | { ok: false; error: string }

export type AutorizarMovimentacaoGerenteResult =
  | { ok: true; movimentacaoId: string; status: StatusMovimentacaoCaixa; saldoAtual: number }
  | { ok: false; error: string; scope?: string; lockUntil?: string }

export type MovimentacaoCaixaDTO = {
  id: string
  numeroSequencial: number | null
  caixaId: string
  operadorId: string
  gerenteId: string | null
  tipo: TipoMovimentacaoCaixa
  formaPagamento: FormaMovimentacaoCaixa
  valor: number
  motivoCodigo: string
  motivo: string
  status: StatusMovimentacaoCaixa
  movimentacaoOrigemId: string | null
  saldoAntes: number
  saldoDepois: number
  createdAt: string
}

export type ObterMovimentacoesCaixaResult =
  | { ok: true; itens: MovimentacaoCaixaDTO[] }
  | { ok: false; error: string }

export type AcaoMovimentacaoCaixaResult =
  | { ok: true; movimentacaoId: string; status?: StatusMovimentacaoCaixa; saldoAtual?: number }
  | { ok: false; error: string }

export type CancelarVendaResult =
  | { ok: true; vendaId: string; status: 'CANCELADA' }
  | { ok: false; error: string }

type ItemAutoritativo = {
  produtoId: string
  quantidade: number
  precoOriginal: number
  precoUnitario: number
  descontoUnitario: number
  tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL'
}

const LIMITE_DIVERGENCIA_FECHAMENTO = 5

function parseMoneyInput(v: number): number | null {
  if (!Number.isFinite(v)) return null
  if (v < 0) return null
  return roundMoney2(v)
}

async function calcularValorSistemaDinheiroCaixa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caixaId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('calcular_valor_sistema_dinheiro_caixa', {
    p_caixa_id: caixaId,
  })

  if (error) {
    throw new Error(
      mensagemErroComSecao(
        'Valor sistema (caixa)',
        error.message.includes('function') && error.message.includes('does not exist')
          ? 'Aplique as migrations 048–049 (devoluções + RPC calcular_valor_sistema_dinheiro_caixa).'
          : error.message,
      ),
    )
  }

  const n = typeof data === 'string' ? Number.parseFloat(data) : Number(data)
  if (!Number.isFinite(n)) {
    throw new Error(mensagemErroComSecao('Valor sistema (caixa)', 'Resposta inválida do servidor.'))
  }
  return roundMoney2(n)
}

async function coletarAuditoriaRequest(): Promise<{
  ipAddress: string | null
  userAgent: string | null
}> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  return {
    ipAddress: forwarded || null,
    userAgent: h.get('user-agent') ?? null,
  }
}

export async function obterStatusCaixaOperador(): Promise<CaixaStatusOperadorResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data: caixaAberto, error } = await supabase
      .from('caixas')
      .select('id, data_abertura, valor_inicial')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return { ok: false, error: mensagemErroComSecao('Caixa', error.message) }
    if (!caixaAberto) return { ok: true, aberto: false }

    const valorSistemaDinheiro = await calcularValorSistemaDinheiroCaixa(supabase, caixaAberto.id)
    const cfgRes = await fetchPdvConfigParaCaixaWeb(supabase)
    if (!cfgRes.ok) {
      return { ok: false, error: mensagemErroComSecao('Configuração PDV', cfgRes.error) }
    }
    return {
      ok: true,
      aberto: true,
      caixaId: caixaAberto.id,
      dataAbertura: caixaAberto.data_abertura,
      valorInicial: Number(caixaAberto.valor_inicial ?? 0),
      valorSistemaDinheiro,
      blindClosureEnabled: Boolean(cfgRes.row?.blind_closure),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível consultar o status do caixa.'),
    }
  }
}

export async function abrirCaixaOperador(valorInicial: number): Promise<AbrirCaixaOperadorResult> {
  const valorInicialSanitizado = parseMoneyInput(valorInicial)
  if (valorInicialSanitizado === null) {
    return { ok: false, error: 'Valor inicial inválido.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data: caixaAberto, error: caixaAbertoErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (caixaAbertoErr)
      return { ok: false, error: mensagemErroComSecao('Caixa', caixaAbertoErr.message) }
    if (caixaAberto) return { ok: false, error: 'Já existe um caixa aberto para este operador.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID
    const { data: novo, error: insertErr } = await supabase
      .from('caixas')
      .insert({
        operador_id: user.id,
        loja_id: lojaId,
        valor_inicial: valorInicialSanitizado,
        status: 'ABERTO',
      })
      .select('id')
      .single()

    if (insertErr) return { ok: false, error: mensagemErroComSecao('Caixa', insertErr.message) }
    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    return { ok: true, caixaId: novo.id }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível abrir o caixa. Tente de novo.'),
    }
  }
}

export async function fecharCaixaOperador(input: {
  valorContado: number
  motivo?: string
}): Promise<FecharCaixaOperadorResult> {
  const valorContado = parseMoneyInput(input.valorContado)
  if (valorContado === null) return { ok: false, error: 'Valor contado inválido.' }
  const motivo = (input.motivo ?? '').trim()
  if (motivo.length > 500) {
    return { ok: false, error: 'Motivo muito longo (máx. 500 caracteres).' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data: caixaAberto, error: caixaErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (caixaErr) return { ok: false, error: mensagemErroComSecao('Caixa', caixaErr.message) }
    if (!caixaAberto) return { ok: false, error: 'Não há caixa aberto para fechar.' }

    const valorSistemaDinheiro = await calcularValorSistemaDinheiroCaixa(supabase, caixaAberto.id)
    const diferenca = roundMoney2(valorContado - valorSistemaDinheiro)
    if (Math.abs(diferenca) > LIMITE_DIVERGENCIA_FECHAMENTO && motivo.length < 5) {
      return {
        ok: false,
        error: `Diferença acima de R$ ${LIMITE_DIVERGENCIA_FECHAMENTO.toFixed(2)} exige motivo (mín. 5 caracteres).`,
      }
    }

    const { error: updateErr } = await supabase
      .from('caixas')
      .update({
        status: 'FECHADO',
        data_fechamento: new Date().toISOString(),
        valor_fechamento: valorContado,
        fechamento_diferenca: diferenca,
        fechamento_observacao: motivo || null,
      })
      .eq('id', caixaAberto.id)

    if (updateErr) return { ok: false, error: mensagemErroComSecao('Caixa', updateErr.message) }

    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    revalidatePath('/gerente/vendas')
    return {
      ok: true,
      caixaId: caixaAberto.id,
      valorSistemaDinheiro,
      valorContado,
      diferenca,
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível fechar o caixa. Tente de novo.'),
    }
  }
}

export async function validarGerenteDesconto(input: {
  senha: string
  lojaId?: string
  deviceFingerprint?: string
}): Promise<ValidarGerenteDescontoResult> {
  const senha = input.senha.trim()
  if (!senha) return { ok: false, error: 'Senha do gerente é obrigatória.' }
  if (senha.length > 128) return { ok: false, error: 'Senha inválida (máx. 128 caracteres).' }

  try {
    const supabase = await createClient()
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession()

    if (sessionErr || !session?.access_token) {
      return { ok: false, error: 'Sessão expirada. Faça login novamente.' }
    }

    const { url } = assertSupabasePublicEnv()
    const response = await fetch(`${url}/functions/v1/validar-gerente`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        'x-device-fingerprint': (input.deviceFingerprint ?? '').trim().toLowerCase().slice(0, 200),
      },
      body: JSON.stringify({
        senha,
        loja_id: input.lojaId?.trim() || undefined,
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok || payload.ok !== true) {
      const code = typeof payload.error === 'string' ? payload.error : ''
      const error =
        code === 'ERRO_PERSISTENCIA_TOKEN'
          ? 'Não foi possível registrar o desconto no servidor. Tente novamente em instantes.'
          : code
            ? mensagemErroParaUsuario(code)
            : `Não foi possível validar o gerente (servidor respondeu com código ${response.status}). Verifique a internet e tente de novo.`
      return {
        ok: false,
        error,
        scope: typeof payload.scope === 'string' ? payload.scope : undefined,
        lockUntil: typeof payload.lock_until === 'string' ? payload.lock_until : undefined,
      }
    }

    return {
      ok: true,
      token: String(payload.token ?? ''),
      expiraEm: String(payload.expira_em ?? ''),
      maxDescontoPercentual: Number(payload.max_desconto_percentual ?? 0),
      gerenteId: String(payload.gerente_id ?? ''),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível validar a senha do gerente.'),
    }
  }
}

export async function obterLimiteSangriaSemGerente(): Promise<LimiteSangriaResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data, error } = await supabase.rpc('obter_limite_sangria_sem_gerente')
    if (error) {
      return { ok: false, error: mensagemErroComSecao('Limite de sangria', error.message) }
    }
    const limite = Number(data ?? 200)
    return { ok: true, limite: Number.isFinite(limite) && limite > 0 ? limite : 200 }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar o limite de sangria.'),
    }
  }
}

export async function registrarMovimentacao(
  dados: RegistrarMovimentacaoInput,
): Promise<RegistrarMovimentacaoResult> {
  const valor = parseMoneyInput(dados.valor)
  if (valor === null || valor <= 0) return { ok: false, error: 'Valor inválido.' }
  const motivo = dados.motivo.trim()
  if (motivo.length < 2) return { ok: false, error: 'Motivo obrigatório (mín. 2 caracteres).' }
  if (!dados.idempotencyKey?.trim()) {
    return { ok: false, error: 'idempotencyKey é obrigatório.' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { ipAddress, userAgent } = await coletarAuditoriaRequest()
    const { data, error } = await supabase.rpc('registrar_movimentacao', {
      p_caixa_id: dados.caixaId,
      p_tipo: dados.tipo,
      p_forma_pagamento: dados.formaPagamento,
      p_valor: valor,
      p_motivo: motivo,
      p_motivo_codigo: (dados.motivoCodigo ?? 'OUTRO').trim() || 'OUTRO',
      p_status: dados.status ?? null,
      p_movimentacao_origem_id: dados.movimentacaoOrigemId ?? null,
      p_idempotency_key: dados.idempotencyKey.trim(),
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_device_id: dados.deviceId?.trim() || null,
      p_terminal_id: dados.terminalId?.trim() || null,
      p_operador_id: user.id,
      p_gerente_id: dados.gerenteId ?? null,
    })

    if (error) return { ok: false, error: mensagemErroComSecao('Movimentação de caixa', error.message) }
    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row?.movimentacao_id) {
      return { ok: false, error: 'A movimentação não retornou identificador.' }
    }

    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    return {
      ok: true,
      movimentacaoId: String(row.movimentacao_id),
      status: String(row.status_movimentacao) as StatusMovimentacaoCaixa,
      saldoAtual: Number(row.saldo_atual ?? 0),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível registrar a movimentação de caixa.'),
    }
  }
}

export async function autorizarMovimentacaoGerente(
  movimentacaoId: string,
  gerenteSenha: string,
): Promise<AutorizarMovimentacaoGerenteResult> {
  const senha = gerenteSenha.trim()
  if (!movimentacaoId.trim()) return { ok: false, error: 'Movimentação inválida.' }
  if (!senha) return { ok: false, error: 'Senha do gerente é obrigatória.' }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const validacao = await validarGerenteDesconto({ senha })
    if (!validacao.ok) {
      return {
        ok: false,
        error: validacao.error,
        scope: validacao.scope,
        lockUntil: validacao.lockUntil,
      }
    }
    if (!validacao.token) {
      return { ok: false, error: 'Não foi possível obter token de autorização do gerente.' }
    }
    if (!validacao.gerenteId) {
      return { ok: false, error: 'Não foi possível identificar o gerente aprovador.' }
    }

    const { ipAddress, userAgent } = await coletarAuditoriaRequest()
    const { data, error } = await supabase.rpc('aprovar_movimentacao', {
      p_movimentacao_id: movimentacaoId,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_device_id: null,
      p_terminal_id: null,
      p_gerente_id: validacao.gerenteId,
      p_autorizacao_token: validacao.token,
    })

    if (error) return { ok: false, error: mensagemErroComSecao('Aprovação de movimentação', error.message) }
    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row?.movimentacao_id) {
      return { ok: false, error: 'A aprovação não retornou identificador.' }
    }

    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    return {
      ok: true,
      movimentacaoId: String(row.movimentacao_id),
      status: String(row.status_movimentacao) as StatusMovimentacaoCaixa,
      saldoAtual: Number(row.saldo_atual ?? 0),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível autorizar a movimentação.'),
    }
  }
}

export async function obterMovimentacoesCaixa(caixaId: string): Promise<ObterMovimentacoesCaixaResult> {
  if (!caixaId.trim()) return { ok: false, error: 'Caixa inválido.' }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data, error } = await supabase
      .from('movimentacoes_caixa')
      .select(
        'id, numero_sequencial, caixa_id, operador_id, gerente_id, tipo, forma_pagamento, valor, motivo_codigo, motivo, status, movimentacao_origem_id, saldo_antes, saldo_depois, created_at',
      )
      .eq('caixa_id', caixaId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return { ok: false, error: mensagemErroComSecao('Movimentações', error.message) }

    const itens: MovimentacaoCaixaDTO[] = (data ?? []).map((row) => ({
      id: row.id,
      numeroSequencial: row.numero_sequencial ? Number(row.numero_sequencial) : null,
      caixaId: row.caixa_id,
      operadorId: row.operador_id,
      gerenteId: row.gerente_id,
      tipo: row.tipo as TipoMovimentacaoCaixa,
      formaPagamento: row.forma_pagamento as FormaMovimentacaoCaixa,
      valor: Number(row.valor ?? 0),
      motivoCodigo: String(row.motivo_codigo ?? 'OUTRO'),
      motivo: String(row.motivo ?? ''),
      status: row.status as StatusMovimentacaoCaixa,
      movimentacaoOrigemId: row.movimentacao_origem_id,
      saldoAntes: Number(row.saldo_antes ?? 0),
      saldoDepois: Number(row.saldo_depois ?? 0),
      createdAt: row.created_at,
    }))

    return { ok: true, itens }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível carregar as movimentações de caixa.'),
    }
  }
}

export async function cancelarMovimentacaoCaixa(
  movimentacaoId: string,
  motivoCancelamento?: string,
): Promise<AcaoMovimentacaoCaixaResult> {
  if (!movimentacaoId.trim()) return { ok: false, error: 'Movimentação inválida.' }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data, error } = await supabase.rpc('cancelar_movimentacao', {
      p_movimentacao_id: movimentacaoId,
      p_motivo_cancelamento: motivoCancelamento?.trim() || null,
    })
    if (error) return { ok: false, error: mensagemErroComSecao('Cancelamento de movimentação', error.message) }

    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row?.movimentacao_id) return { ok: false, error: 'Cancelamento não retornou identificador.' }

    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    return {
      ok: true,
      movimentacaoId: String(row.movimentacao_id),
      status: String(row.status_movimentacao) as StatusMovimentacaoCaixa,
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível cancelar a movimentação.'),
    }
  }
}

export async function estornarMovimentacaoCaixa(
  movimentacaoOrigemId: string,
  motivo: string,
): Promise<AcaoMovimentacaoCaixaResult> {
  const motivoSanitizado = motivo.trim()
  if (!movimentacaoOrigemId.trim()) return { ok: false, error: 'Movimentação inválida.' }
  if (motivoSanitizado.length < 2) return { ok: false, error: 'Motivo obrigatório (mín. 2 caracteres).' }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { ipAddress, userAgent } = await coletarAuditoriaRequest()
    const { data, error } = await supabase.rpc('estornar_movimentacao', {
      p_movimentacao_origem_id: movimentacaoOrigemId,
      p_motivo: motivoSanitizado,
      p_idempotency_key: `estorno:${movimentacaoOrigemId}:${crypto.randomUUID()}`,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_device_id: null,
      p_terminal_id: null,
      p_operador_id: user.id,
    })
    if (error) return { ok: false, error: mensagemErroComSecao('Estorno de movimentação', error.message) }

    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row?.movimentacao_id) return { ok: false, error: 'Estorno não retornou identificador.' }

    revalidatePath('/caixa')
    revalidatePath('/gerente/caixas')
    return {
      ok: true,
      movimentacaoId: String(row.movimentacao_id),
      status: String(row.status_movimentacao) as StatusMovimentacaoCaixa,
      saldoAtual: Number(row.saldo_atual ?? 0),
    }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível estornar a movimentação.'),
    }
  }
}

export async function cancelarVenda(
  vendaId: string,
  motivo: string,
): Promise<CancelarVendaResult> {
  const vendaIdTrim = vendaId.trim()
  const motivoTrim = motivo.trim()
  if (!vendaIdTrim) return { ok: false, error: 'Venda inválida.' }
  if (motivoTrim.length < 2) return { ok: false, error: 'Motivo obrigatório (mín. 2 caracteres).' }
  if (motivoTrim.length > 500) return { ok: false, error: 'Motivo muito longo (máx. 500 caracteres).' }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const { data, error } = await supabase.rpc('cancelar_venda_transacional', {
      p_venda_id: vendaIdTrim,
      p_motivo: motivoTrim,
      p_operador_id: user.id,
    })
    if (error) return { ok: false, error: mensagemErroComSecao('Cancelamento de venda', error.message) }

    const row = Array.isArray(data) ? data[0] : (data as any)
    if (!row?.venda_id) return { ok: false, error: 'Cancelamento não retornou identificador da venda.' }

    revalidatePath('/caixa')
    revalidatePath('/gerente/vendas')
    revalidatePath(`/gerente/vendas/${vendaIdTrim}`)
    revalidatePath('/gerente/caixas')
    revalidatePath('/gerente/financeiro')
    return { ok: true, vendaId: String(row.venda_id), status: 'CANCELADA' }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível cancelar a venda.'),
    }
  }
}

async function recalcularItensNoServidor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itensInput: Array<{ produtoId: string; quantidade: number }>,
): Promise<{ ok: true; itens: ItemAutoritativo[] } | { ok: false; error: string }> {
  const produtosIds = Array.from(new Set(itensInput.map((i) => i.produtoId)))
  const { data: produtosRows, error: prodErr } = await supabase
    .from('produtos')
    .select('id, nome, preco_varejo, preco_atacado, categoria_id, ativo')
    .in('id', produtosIds)
    .eq('ativo', true)

  if (prodErr) return { ok: false, error: mensagemErroComSecao('Produtos', prodErr.message) }
  const produtos = new Map((produtosRows ?? []).map((p) => [p.id, p]))
  if (produtos.size !== produtosIds.length) {
    return { ok: false, error: 'Há itens inválidos/inativos no carrinho. Atualize e tente novamente.' }
  }

  const { data: regrasRows, error: regrasErr } = await supabase
    .from('regras_preco')
    .select(
      'id, tipo_regra, produto_id, categoria_id, quantidade_minima, quantidade_maxima, tipo_desconto, valor_desconto, data_validade, ativo',
    )
    .eq('ativo', true)
  if (regrasErr) return { ok: false, error: mensagemErroComSecao('Regras de preço', regrasErr.message) }
  const regras = (regrasRows as RegraPrecoRow[] | null)?.map(mapRegraPrecoRow) ?? []

  const cfgRes = await fetchPdvConfigParaCaixaWeb(supabase)
  const cfg = cfgRes.ok ? cfgRes.row : null
  const pricingCtx: PricingContext = {
    quantidadeMinimaAtacadoPadrao: cfg?.quantidade_minima_atacado_padrao
      ? Number(cfg.quantidade_minima_atacado_padrao)
      : DEFAULT_PRICING_CONTEXT.quantidadeMinimaAtacadoPadrao,
  }

  const quantidadePorProduto = itensInput.reduce<Record<string, number>>((acc, item) => {
    acc[item.produtoId] = (acc[item.produtoId] ?? 0) + item.quantidade
    return acc
  }, {})

  const itens: ItemAutoritativo[] = []
  for (const i of itensInput) {
    const p = produtos.get(i.produtoId)!
    const pa = p.preco_atacado
    const itemCarrinho: ItemCarrinho = {
      id: crypto.randomUUID(),
      produtoId: p.id,
      nome: p.nome,
      quantidade: i.quantidade,
      precoVariejo: Number(p.preco_varejo),
      precoAtacado: pa === null || pa === undefined ? null : Number(pa),
      categoriaId: p.categoria_id ?? undefined,
    }
    const preco = pricingService.calcularPreco(
      itemCarrinho,
      regras,
      quantidadePorProduto[i.produtoId],
      pricingCtx,
    )
    itens.push({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      precoOriginal: roundMoney2(preco.precoOriginal),
      precoUnitario: roundMoney2(preco.precoUnitario),
      descontoUnitario: roundMoney2(preco.descontoUnitario),
      tipoPreco: preco.tipoPreco,
    })
  }
  return { ok: true, itens }
}

/**
 * Persiste venda + itens no Supabase e aplica baixa de estoque via RPC
 * `decrementar_estoque_seguro` (migrations 016–017: atômico + validação de operador).
 */
export async function finalizarVendaCaixa(raw: unknown): Promise<FinalizarVendaCaixaResult> {
  const parsed = finalizarVendaInputSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join('; ')
    return { ok: false, error: mensagemErroValidacaoZod(msg) }
  }
  const input = parsed.data
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Faça login novamente.' }

    const lojaId = (await getLojaIdUsuario(supabase, user.id)) ?? LOJA_MATRIZ_ID

    const itensCliente = input.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade }))
    const recalc = await recalcularItensNoServidor(supabase, itensCliente)
    if (!recalc.ok) return { ok: false, error: recalc.error }
    const itensAut = recalc.itens

    const computedBase = totaisFromItens(itensAut)
    const gerentePercentual = input.descontoGerentePercentual ?? null
    const hasDescontoGerente = !!input.descontoGerenteToken && gerentePercentual !== null
    const descontoGerenteValor = hasDescontoGerente
      ? roundMoney2((computedBase.totalLiquido * gerentePercentual) / 100)
      : 0
    const computedFinal = {
      totalBruto: computedBase.totalBruto,
      totalDesconto: roundMoney2(computedBase.totalDesconto + descontoGerenteValor),
      totalLiquido: roundMoney2(computedBase.totalLiquido - descontoGerenteValor),
    }

    if (!totalsMatchDeclared(computedFinal, input)) {
      return {
        ok: false,
        error:
          'Os preços/regras do carrinho mudaram. Reabra o caixa e tente novamente para recalcular.',
      }
    }

    // Pré-checagem de estoque (melhor UX; a RPC 016/017 é a fonte de verdade sob concorrência)
    const estoquesInsuficientes: string[] = []
    const produtoIds = Array.from(new Set(itensAut.map((i) => i.produtoId)))
    const { data: estoqueRows, error: estqBatchErr } = await supabase
      .from('estoque')
      .select('produto_id, quantidade_atual, produtos!inner(nome)')
      .eq('loja_id', lojaId)
      .in('produto_id', produtoIds)

    if (estqBatchErr) {
      return {
        ok: false,
        error: mensagemErroComSecao('Estoque', estqBatchErr.message),
      }
    }

    const estoquePorProduto = new Map<
      string,
      { quantidade_atual: number; nome: string }
    >()
    for (const row of estoqueRows ?? []) {
      const pid = row.produto_id as string
      const p = row.produtos as
        | { nome?: string }
        | { nome?: string }[]
        | null
      const nomeProduto =
        (Array.isArray(p) ? p[0]?.nome : p?.nome) ?? 'Produto'
      estoquePorProduto.set(pid, {
        quantidade_atual: Number(row.quantidade_atual ?? 0),
        nome: nomeProduto,
      })
    }

    for (const item of itensAut) {
      const row = estoquePorProduto.get(item.produtoId)
      if (!row) {
        estoquesInsuficientes.push(
          `Produto sem linha de estoque (id ${item.produtoId.slice(0, 8)}…).`,
        )
      } else if (row.quantidade_atual < item.quantidade) {
        estoquesInsuficientes.push(
          `${row.nome}: solicitado ${item.quantidade}, disponível ${row.quantidade_atual}`,
        )
      }
    }

    if (estoquesInsuficientes.length > 0) {
      return {
        ok: false,
        error: `Estoque insuficiente:\n${estoquesInsuficientes.join('\n')}`,
      }
    }

    const { data: caixaExistente, error: caixaAbertoErr } = await supabase
      .from('caixas')
      .select('id')
      .eq('operador_id', user.id)
      .eq('status', 'ABERTO')
      .order('data_abertura', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (caixaAbertoErr)
      return { ok: false, error: mensagemErroComSecao('Caixa', caixaAbertoErr.message) }
    if (!caixaExistente) {
      return {
        ok: false,
        error: 'Caixa fechado. Abra o caixa antes de finalizar a venda.',
      }
    }
    const caixaId = caixaExistente.id

    const useUnifiedSalesFlow = process.env.USE_UNIFIED_SALES_FLOW === 'true'
    const vendaId = resolveVendaIdForFinalize({
      useUnifiedSalesFlow,
      idempotencyKey: input.idempotencyKey,
      randomUuid: () => crypto.randomUUID(),
    })
    const itensRpc = itensAut.map((i) => ({
      item_id: crypto.randomUUID(),
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      preco_original: roundMoney2(i.precoOriginal),
      preco_unitario: roundMoney2(i.precoUnitario),
      tipo_preco: i.tipoPreco,
    }))

    const strictManagerDiscountAuth = process.env.STRICT_MANAGER_DISCOUNT_AUTH === 'true'
    const rpcName = useUnifiedSalesFlow
      ? 'finalizar_venda_transacional_canonica_v2'
      : 'finalizar_venda_transacional'

    const rpcParams = useUnifiedSalesFlow
      ? {
          p_venda_id: vendaId,
          p_caixa_id: caixaId,
          p_operador_id: user.id,
          p_forma_pagamento: input.formaPagamento,
          p_total_bruto: computedFinal.totalBruto,
          p_total_desconto: computedFinal.totalDesconto,
          p_total_liquido: computedFinal.totalLiquido,
          p_pagamentos: input.pagamentos.map(
            (p): PagamentoParcelaRpc => ({
              forma_pagamento: p.formaPagamento,
              valor: roundMoney2(p.valor),
            }),
          ),
          p_itens: itensRpc,
          p_desconto_gerente_token: input.descontoGerenteToken ?? null,
          p_desconto_gerente_percentual: input.descontoGerentePercentual ?? null,
          p_strict_manager_discount_auth: strictManagerDiscountAuth,
        }
      : {
          p_venda_id: vendaId,
          p_caixa_id: caixaId,
          p_forma_pagamento: input.formaPagamento,
          p_total_bruto: computedFinal.totalBruto,
          p_total_desconto: computedFinal.totalDesconto,
          p_total_liquido: computedFinal.totalLiquido,
          p_itens: itensRpc,
          p_desconto_gerente_token: input.descontoGerenteToken ?? null,
          p_desconto_gerente_percentual: input.descontoGerentePercentual ?? null,
        }

    const { error: txErr } = await supabase.rpc(rpcName, rpcParams)
    if (txErr) return { ok: false, error: mensagemErroComSecao('Finalização da venda', txErr.message) }

    revalidatePath('/gerente/vendas')
    return { ok: true, vendaId }
  } catch (e) {
    return {
      ok: false,
      error: mensagemErroDeExcecao(e, 'Não foi possível finalizar a venda. Tente de novo.'),
    }
  }
}
