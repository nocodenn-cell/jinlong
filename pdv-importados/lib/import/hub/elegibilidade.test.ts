import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '@shared-core/src/import'
import { chaveErro, motivosInelegibilidade, pendenciasDaLista } from './elegibilidade'

const base = {
  tipo: 'APURACAO' as const,
  statusCalculo: 'OK' as const,
  conservacaoOk: true,
  engineVersion: ENGINE_VERSION,
  versaoDadosApuracao: 7,
  versaoDadosOperacao: 7,
  divergencias: [{ severidade: 'AVISO' }],
  lancamentos: [{ status_conferencia: 'CONFERIDO' }],
}

describe('motivosInelegibilidade', () => {
  it('apuração válida, atual e conferida: elegível', () => {
    expect(motivosInelegibilidade(base)).toEqual([])
  })
  it('lista cada motivo', () => {
    expect(
      motivosInelegibilidade({
        ...base,
        tipo: 'SIMULACAO',
        statusCalculo: 'BLOQUEADO',
        conservacaoOk: false,
        engineVersion: 'outro',
        versaoDadosApuracao: 6,
        divergencias: [{ severidade: 'BLOQUEANTE' }],
        lancamentos: [{ status_conferencia: 'PENDENTE' }],
      }),
    ).toEqual(['SIMULACAO', 'STATUS_BLOQUEADO', 'DIVERGENCIA_BLOQUEANTE', 'CONSERVACAO_FALHOU', 'VERSAO_MOTOR_DIFERENTE', 'DESATUALIZADA', 'NAO_CONFERIDOS'])
  })
})

describe('pendenciasDaLista', () => {
  const r = { status: 'RASCUNHO', ultima_apuracao_id: 'a', ultima_apuracao_status: 'OK' as const, ultima_apuracao_atual: true, ultima_apuracao_bloqueantes: 0 }
  it('classifica pendências só de operações em conferência', () => {
    expect(pendenciasDaLista(r)).toEqual([])
    expect(pendenciasDaLista({ ...r, ultima_apuracao_id: null })).toEqual(['SEM_APURACAO'])
    expect(pendenciasDaLista({ ...r, ultima_apuracao_bloqueantes: 1, ultima_apuracao_atual: false })).toEqual(['BLOQUEADA', 'DESATUALIZADA'])
    expect(pendenciasDaLista({ ...r, status: 'APROVADA', ultima_apuracao_id: null })).toEqual([])
  })
})

describe('chaveErro', () => {
  it('traduz códigos do banco', () => {
    expect(chaveErro('IMPORT_NAO_AUTORIZADO')).toBe('erro_nao_autorizado')
    expect(chaveErro('permission denied for function import_aprovar_apuracao')).toBe('erro_nao_autorizado')
    expect(chaveErro('IMPORT_OPERACAO_NAO_EDITAVEL')).toBe('erro_nao_editavel')
    expect(chaveErro('duplicate key value violates unique constraint "import_operacoes_ref_unica"')).toBe('erro_referencia_duplicada')
    expect(chaveErro('IMPORT_LANCAMENTOS_NAO_CONFERIDOS')).toBe('erro_lancamentos_nao_conferidos')
    expect(chaveErro('algo inesperado')).toBe('erro_generico')
  })
})
