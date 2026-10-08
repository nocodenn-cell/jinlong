'use server'

import { createClient } from '@/lib/supabase/server'
import type {
  FechamentoFormaLinha,
  FechamentoFormasResult,
} from '@/app/caixa/fechamentoPorFormaTypes'
import { caixaMsgOperador } from '@/app/caixa/server/caixaMensagensServidor'

type RpcRow = {
  forma_pagamento: string
  metrica: string
  valor_sistema_snapshot: number | string
  valor_informado: number | string | null
  diferenca: number | string | null
  origem_regra: string
}

const FORMAS = new Set(['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO'])
const METRICAS = new Set(['E_C_AUTORIDADE', 'REGISTRADO_JINLONG'])

function mapRow(row: RpcRow): FechamentoFormaLinha | null {
  if (!FORMAS.has(row.forma_pagamento) || !METRICAS.has(row.metrica)) return null
  const valor = Number(row.valor_sistema_snapshot)
  if (!Number.isFinite(valor)) return null
  return {
    formaPagamento: row.forma_pagamento as FechamentoFormaLinha['formaPagamento'],
    metrica: row.metrica as FechamentoFormaLinha['metrica'],
    valorSistemaSnapshot: valor,
    valorInformado:
      row.valor_informado === null || row.valor_informado === undefined
        ? null
        : Number(row.valor_informado),
    diferenca:
      row.diferenca === null || row.diferenca === undefined ? null : Number(row.diferenca),
    origemRegra: String(row.origem_regra ?? ''),
  }
}

/** Lê snapshot auditável — nunca inventa zero em falha. */
export async function listarFechamentoFormasCaixaImpl(
  caixaId: string,
): Promise<FechamentoFormasResult> {
  const id = (caixaId ?? '').trim()
  if (!id) {
    return { ok: false, error: await caixaMsgOperador('err_srv_caixa_sem_aberto') }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('listar_caixas_fechamento_formas', {
      p_caixa_id: id,
    })
    if (error) {
      return { ok: false, error: error.message || 'Erro ao carregar formas do fechamento.' }
    }
    const rows = (Array.isArray(data) ? data : []) as RpcRow[]
    const linhas: FechamentoFormaLinha[] = []
    for (const row of rows) {
      const mapped = mapRow(row)
      if (mapped) linhas.push(mapped)
    }
    if (linhas.length === 0) {
      return {
        ok: false,
        error: 'Snapshot por forma indisponível para este caixa.',
      }
    }
    return { ok: true, linhas }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Erro ao carregar formas do fechamento.',
    }
  }
}
