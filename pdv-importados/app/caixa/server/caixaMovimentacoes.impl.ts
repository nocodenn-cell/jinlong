import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemErroComSecao, mensagemErroDeExcecao } from '@/lib/errors/mensagemErroUsuario'
import type {
  AcaoMovimentacaoCaixaResult,
  AutorizarMovimentacaoGerenteResult,
  FormaMovimentacaoCaixa,
  MovimentacaoCaixaDTO,
  ObterMovimentacoesCaixaResult,
  RegistrarMovimentacaoInput,
  RegistrarMovimentacaoResult,
  StatusMovimentacaoCaixa,
  TipoMovimentacaoCaixa,
} from '@/app/caixa/caixaMovimentacaoTypes'
import { coletarAuditoriaRequest, parseMoneyInput } from '@/app/caixa/server/caixaActionsInternals'
import { validarGerenteDescontoImpl } from '@/app/caixa/server/caixaGerenteDesconto.impl'

type RpcMovimentacaoResultRow = {
  movimentacao_id?: unknown
  status_movimentacao?: unknown
  saldo_atual?: unknown
}

function firstRpcMovimentacaoRow(data: unknown): RpcMovimentacaoResultRow | undefined {
  if (data == null) return undefined
  return (Array.isArray(data) ? data[0] : data) as RpcMovimentacaoResultRow
}

export async function registrarMovimentacaoImpl(
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
    const row = firstRpcMovimentacaoRow(data)
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

export async function autorizarMovimentacaoGerenteImpl(
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

    const validacao = await validarGerenteDescontoImpl({ senha })
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
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('aprovar_movimentacao', {
      p_movimentacao_id: movimentacaoId,
      p_ip_address: ipAddress,
      p_user_agent: userAgent ?? undefined,
      p_device_id: undefined,
      p_terminal_id: undefined,
      p_gerente_id: validacao.gerenteId,
      p_autorizacao_token: validacao.token,
    })

    if (error) return { ok: false, error: mensagemErroComSecao('Aprovação de movimentação', error.message) }
    const row = firstRpcMovimentacaoRow(data)
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

export async function obterMovimentacoesCaixaImpl(caixaId: string): Promise<ObterMovimentacoesCaixaResult> {
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

export async function cancelarMovimentacaoCaixaImpl(
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

    const row = firstRpcMovimentacaoRow(data)
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

export async function estornarMovimentacaoCaixaImpl(
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

    const row = firstRpcMovimentacaoRow(data)
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
