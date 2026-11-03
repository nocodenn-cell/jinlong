/**
 * Elegibilidade para aprovação — só para EXIBIR os motivos ao usuário.
 * Quem decide é o servidor: `aprovarApuracao` recalcula com o motor e o banco
 * (`import_aprovar_apuracao`) revalida tudo. Esta função nunca autoriza nada.
 */
import { ENGINE_VERSION } from '@shared-core/src/import'

export type MotivoInelegivel =
  | 'SIMULACAO'
  | 'STATUS_BLOQUEADO'
  | 'DIVERGENCIA_BLOQUEANTE'
  | 'CONSERVACAO_FALHOU'
  | 'VERSAO_MOTOR_DIFERENTE'
  | 'DESATUALIZADA'
  | 'NAO_CONFERIDOS'

export function motivosInelegibilidade(args: {
  tipo: 'SIMULACAO' | 'APURACAO'
  statusCalculo: 'OK' | 'BLOQUEADO'
  conservacaoOk: boolean
  engineVersion: string
  versaoDadosApuracao: number
  versaoDadosOperacao: number
  divergencias: readonly { severidade: string }[]
  lancamentos: readonly { status_conferencia: string }[]
}): MotivoInelegivel[] {
  const m: MotivoInelegivel[] = []
  if (args.tipo === 'SIMULACAO') m.push('SIMULACAO')
  if (args.statusCalculo !== 'OK') m.push('STATUS_BLOQUEADO')
  if (args.divergencias.some((d) => d.severidade === 'BLOQUEANTE')) m.push('DIVERGENCIA_BLOQUEANTE')
  if (!args.conservacaoOk) m.push('CONSERVACAO_FALHOU')
  if (args.engineVersion !== ENGINE_VERSION) m.push('VERSAO_MOTOR_DIFERENTE')
  if (args.versaoDadosApuracao !== args.versaoDadosOperacao) m.push('DESATUALIZADA')
  if (args.lancamentos.some((l) => l.status_conferencia !== 'CONFERIDO')) m.push('NAO_CONFERIDOS')
  return m
}

export type Pendencia = 'SEM_APURACAO' | 'BLOQUEADA' | 'DESATUALIZADA'

/** Pendências de uma linha da lista (operação em conferência). */
export function pendenciasDaLista(row: {
  status: string
  ultima_apuracao_id: string | null
  ultima_apuracao_status: 'OK' | 'BLOQUEADO' | null
  ultima_apuracao_atual: boolean | null
  ultima_apuracao_bloqueantes: number
}): Pendencia[] {
  if (row.status !== 'RASCUNHO') return []
  if (!row.ultima_apuracao_id) return ['SEM_APURACAO']
  const p: Pendencia[] = []
  if (row.ultima_apuracao_status !== 'OK' || row.ultima_apuracao_bloqueantes > 0) p.push('BLOQUEADA')
  if (row.ultima_apuracao_atual === false) p.push('DESATUALIZADA')
  return p
}

/** Código de erro do banco/servidor → chave de mensagem do hub. */
export function chaveErro(mensagem: string | null | undefined): string {
  const t = mensagem ?? ''
  const mapa: [RegExp, string][] = [
    [/IMPORT_NAO_AUTORIZADO|NAO_AUTORIZADO|IMPORT_AUTH|MODULO_NEGADO|permission denied|42501/, 'erro_nao_autorizado'],
    [/IMPORT_OPERACAO_NAO_EDITAVEL/, 'erro_nao_editavel'],
    [/IMPORT_DADOS_ALTERADOS/, 'erro_dados_alterados'],
    [/IMPORT_IDEMPOTENCIA_CONFLITO|IMPORT_APURACAO_CONFLITO_CONTEUDO/, 'erro_conflito_conteudo'],
    [/IMPORT_PRODUTO_FORA_DA_EMPRESA/, 'erro_produto_fora'],
    [/IMPORT_FORNECEDOR_FORA_DA_EMPRESA/, 'erro_fornecedor_fora'],
    [/IMPORT_MOTIVO_OBRIGATORIO|MOTIVO/, 'erro_motivo'],
    [/RECALCULO_DIVERGENTE|IMPORT_RECALCULO_NAO_CONFERIDO/, 'erro_recalculo'],
    [/import_operacoes_ref_unica|duplicate key/, 'erro_referencia_duplicada'],
    [/IMPORT_LANCAMENTOS_NAO_CONFERIDOS/, 'erro_lancamentos_nao_conferidos'],
    [/VALOR_INVALIDO|invalid input syntax for type numeric/, 'erro_valor_invalido'],
  ]
  for (const [re, chave] of mapa) if (re.test(t)) return chave
  return 'erro_generico'
}
