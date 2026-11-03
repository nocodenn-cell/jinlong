/**
 * Adapter do Import Intelligence (F4): liga o motor de landed cost (shared-core) à persistência.
 *
 * Regras:
 *  - O cálculo é SEMPRE do motor existente (`calcularLandedCost`). Nada de regra duplicada aqui.
 *  - A entrada vem do BANCO (`import_montar_entrada`), lida com a sessão do usuário (RLS + módulo).
 *  - Hash = sha256 da serialização canônica do motor (`serializarCanonico`).
 *  - Aprovar: recalcula a partir da ENTRADA GUARDADA, exige `verificarAprovacao` e hash idêntico
 *    ao da saída guardada; só então chama `import_aprovar_apuracao` com o client de serviço, que
 *    revalida no banco que o aprovador é DONO da empresa com módulo ativo.
 *  - Nenhuma escrita em estoque, contas a pagar ou preços.
 */
import { createHash } from 'node:crypto'
import {
  calcularLandedCost,
  serializarCanonico,
  verificarAprovacao,
  type LandedCostInput,
  type LandedCostOutput,
} from '@shared-core/src/import'
import { requireModulo, type ClienteSessao } from '@/lib/modulos/requireModulo'

type RpcResult<T> = PromiseLike<{ data: T; error: { message: string } | null }>

export type ClienteImport = Omit<ClienteSessao, 'rpc'> & {
  rpc: (fn: string, args: Record<string, unknown>) => RpcResult<unknown>
  from: (tabela: string) => {
    select: (colunas: string) => {
      eq: (coluna: string, valor: string) => { maybeSingle: () => RpcResult<Record<string, unknown> | null> }
    }
  }
}

export type ClienteServico = {
  rpc: (fn: string, args: Record<string, unknown>) => RpcResult<unknown>
}

export type FalhaImport = {
  ok: false
  motivo: 'MODULO_NEGADO' | 'ENTRADA_INVALIDA' | 'ERRO_BANCO' | 'NAO_APROVAVEL' | 'RECALCULO_DIVERGENTE' | 'NAO_ENCONTRADA'
  detalhe?: string
}

export function sha256Canonico(valor: unknown): string {
  return createHash('sha256').update(serializarCanonico(valor), 'utf8').digest('hex')
}

/**
 * Calcula com o motor sobre a entrada montada pelo banco e registra a apuração (imutável).
 * O registro é feito pelo client de serviço (D-06): a sessão do usuário não grava saída. O ator é
 * o usuário da sessão e é reautorizado no banco (DONO/GERENTE da empresa e loja, módulo ativo).
 */
export async function apurarOperacao(
  client: ClienteImport,
  servico: ClienteServico,
  operacaoId: string,
  tipo: 'SIMULACAO' | 'APURACAO',
): Promise<
  | { ok: true; apuracaoId: string; status: 'OK' | 'BLOQUEADO'; saidaSha256: string; saida: LandedCostOutput }
  | FalhaImport
> {
  const gate = await requireModulo(client, 'IMPORT_INTELLIGENCE', { papeis: ['DONO', 'GERENTE'] })
  if (!gate.ok) return { ok: false, motivo: 'MODULO_NEGADO', detalhe: gate.motivo }
  const { data: u } = await client.auth.getUser()
  const atorId = u.user?.id
  if (!atorId) return { ok: false, motivo: 'MODULO_NEGADO', detalhe: 'SEM_SESSAO' }

  const montada = await client.rpc('import_montar_entrada', { p_operacao: operacaoId })
  if (montada.error || !montada.data) return { ok: false, motivo: 'ERRO_BANCO', detalhe: montada.error?.message }
  const { versao_dados: versaoDados, entrada } = montada.data as { versao_dados: number; entrada: LandedCostInput }

  const resultado = calcularLandedCost(entrada)
  if (!resultado.ok) {
    return { ok: false, motivo: 'ENTRADA_INVALIDA', detalhe: `${resultado.error.codigo}: ${resultado.error.detalhe ?? ''}` }
  }

  // Entrada e hash de entrada são calculados no banco (D-04/D-06); aqui só a saída do motor.
  const saidaSha256 = sha256Canonico(resultado.value)
  const reg = await servico.rpc('import_registrar_apuracao', {
    p_operacao: operacaoId,
    p_ator: atorId,
    p_tipo: tipo,
    p_versao_dados: versaoDados,
    p_saida: resultado.value,
    p_saida_sha256: saidaSha256,
  })
  if (reg.error || typeof reg.data !== 'string') return { ok: false, motivo: 'ERRO_BANCO', detalhe: reg.error?.message }

  return { ok: true, apuracaoId: reg.data, status: resultado.value.status, saidaSha256, saida: resultado.value }
}

/**
 * Recalcula a apuração guardada e confere. Não confia em flag ou hash gravado:
 * recalcula do zero a partir da entrada persistida.
 */
export async function verificarApuracaoGuardada(
  client: ClienteImport,
  apuracaoId: string,
): Promise<{ ok: true; aprovavel: boolean; confere: boolean; motivos: string[]; saidaSha256: string } | FalhaImport> {
  const { data, error } = await client
    .from('import_apuracoes')
    .select('id, entrada, saida_sha256')
    .eq('id', apuracaoId)
    .maybeSingle()
  if (error) return { ok: false, motivo: 'ERRO_BANCO', detalhe: error.message }
  if (!data) return { ok: false, motivo: 'NAO_ENCONTRADA' }

  // A entrada guardada é a do banco no instante do registro (o banco também grava seu hash).
  const entrada = data.entrada as LandedCostInput
  const recalculo = calcularLandedCost(entrada)
  const verificacao = verificarAprovacao(recalculo)
  const saidaSha256 = recalculo.ok ? sha256Canonico(recalculo.value) : ''
  const confere = recalculo.ok && saidaSha256 === data.saida_sha256
  return { ok: true, aprovavel: verificacao.aprovavel, confere, motivos: [...verificacao.motivos], saidaSha256 }
}

/** Aprova uma apuração: usuário (DONO) pela sessão; gravação pelo client de serviço, revalidada no banco. */
export async function aprovarApuracao(
  userClient: ClienteImport,
  servico: ClienteServico,
  apuracaoId: string,
  motivo: string,
): Promise<{ ok: true } | FalhaImport> {
  const gate = await requireModulo(userClient, 'IMPORT_INTELLIGENCE', { papeis: ['DONO'] })
  if (!gate.ok) return { ok: false, motivo: 'MODULO_NEGADO', detalhe: gate.motivo }
  const { data: u } = await userClient.auth.getUser()
  const atorId = u.user?.id
  if (!atorId) return { ok: false, motivo: 'MODULO_NEGADO', detalhe: 'SEM_SESSAO' }

  const v = await verificarApuracaoGuardada(userClient, apuracaoId)
  if (!v.ok) return v
  if (!v.aprovavel) return { ok: false, motivo: 'NAO_APROVAVEL', detalhe: v.motivos.join(',') }
  if (!v.confere) return { ok: false, motivo: 'RECALCULO_DIVERGENTE' }

  const r = await servico.rpc('import_aprovar_apuracao', {
    p_apuracao: apuracaoId,
    p_ator: atorId,
    p_motivo: motivo,
    p_verificacao: { recalculo_confere: true, saida_sha256: v.saidaSha256, motivos: v.motivos },
  })
  if (r.error) return { ok: false, motivo: 'ERRO_BANCO', detalhe: r.error.message }
  return { ok: true }
}
