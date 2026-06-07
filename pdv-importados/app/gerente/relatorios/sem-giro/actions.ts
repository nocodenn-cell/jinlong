'use server'

import { createClient } from '@/lib/supabase/server'
import { getRelatorioTimezone } from '@/lib/relatorios/getRelatorioTimezone'
import {
  resolverPeriodoRelatorio,
  type PeriodoRelatorioResolvido,
} from '@/lib/relatorios/periodoRelatorio'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'

export type RelatorioSemGiroDTO = {
  produto_id: string
  nome: string
  codigo_barras: string | null
  quantidade_atual: number
  estoque_minimo: number
  preco_custo: number | null
  /** quantidade_atual * preco_custo — capital parado na prateleira. */
  valor_imobilizado: number
  /** Última venda CONCLUIDA do produto na loja (qualquer data); null = nunca vendeu. */
  ultima_venda: string | null
}

export type RelatorioSemGiroPayload = {
  periodo: Pick<PeriodoRelatorioResolvido, 'de' | 'ate' | 'aviso'>
  tzRelatorio: string
  itens: RelatorioSemGiroDTO[]
  rpcErro: string | null
  rpcErroAmigavel: string | null
}

/**
 * Deslocamento (minutos a leste de UTC) da timezone IANA no instante dado.
 * Base para converter uma data civil em instante UTC respeitando DST.
 */
function offsetMinutosTz(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const partes = dtf.formatToParts(date)
  const m: Record<string, number> = {}
  for (const p of partes) if (p.type !== 'literal') m[p.type] = Number(p.value)
  const comoUtc = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute, m.second)
  return Math.round((comoUtc - date.getTime()) / 60_000)
}

/** Instante UTC (ISO) da meia-noite civil de `dataYmd` na timezone `tz`. */
function inicioDiaIso(dataYmd: string, tz: string): string {
  const [y, mo, d] = dataYmd.split('-').map(Number)
  const parede = Date.UTC(y, mo - 1, d, 0, 0, 0, 0)
  const off = offsetMinutosTz(new Date(parede), tz)
  return new Date(parede - off * 60_000).toISOString()
}

/** Instante UTC (ISO) do início do dia seguinte — limite superior exclusivo. */
function fimExclusivoIso(dataYmd: string, tz: string): string {
  const [y, mo, d] = dataYmd.split('-').map(Number)
  const parede = Date.UTC(y, mo - 1, d + 1, 0, 0, 0, 0)
  const off = offsetMinutosTz(new Date(parede), tz)
  return new Date(parede - off * 60_000).toISOString()
}

/** Produtos com saldo positivo e sem saída por venda no período (capital parado). */
export async function carregarProdutosSemGiro(input: {
  de?: string
  ate?: string
}): Promise<RelatorioSemGiroPayload> {
  const auth = await assertGerenteSession()
  if (!auth.ok) {
    return {
      periodo: { de: input.de ?? '', ate: input.ate ?? '', aviso: 'nenhum' },
      tzRelatorio: 'America/Sao_Paulo',
      itens: [],
      rpcErro: auth.error,
      rpcErroAmigavel: auth.error,
    }
  }

  const supabase = await createClient()
  const tzRelatorio = await getRelatorioTimezone(supabase)
  const periodo = resolverPeriodoRelatorio(input.de, input.ate, tzRelatorio)

  const lojaId = auth.session.lojaId ?? LOJA_MATRIZ_ID

  const { data, error } = await supabase.rpc('relatorio_produtos_sem_giro_periodo', {
    p_loja_id: lojaId,
    p_data_inicio: inicioDiaIso(periodo.de, tzRelatorio),
    p_data_fim: fimExclusivoIso(periodo.ate, tzRelatorio),
  })

  const rpcErro = error?.message ?? null
  const rpcErroAmigavel = rpcErro ? mensagemErroParaUsuario(rpcErro) : null

  type SemGiroRpcRow = {
    produto_id: string
    nome: string
    codigo_barras: string | null
    quantidade_atual: number | string
    estoque_minimo: number | string
    preco_custo: number | string | null
    valor_imobilizado: number | string
    ultima_venda: string | null
  }

  const itens: RelatorioSemGiroDTO[] = ((data ?? []) as SemGiroRpcRow[]).map((r) => ({
    produto_id: r.produto_id,
    nome: r.nome,
    codigo_barras: r.codigo_barras,
    quantidade_atual: Number(r.quantidade_atual),
    estoque_minimo: Number(r.estoque_minimo),
    preco_custo: r.preco_custo === null || r.preco_custo === undefined ? null : Number(r.preco_custo),
    valor_imobilizado: Number(r.valor_imobilizado),
    ultima_venda: r.ultima_venda ?? null,
  }))

  return {
    periodo: { de: periodo.de, ate: periodo.ate, aviso: periodo.aviso },
    tzRelatorio,
    itens,
    rpcErro,
    rpcErroAmigavel,
  }
}
