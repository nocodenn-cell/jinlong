/**
 * Domínio satélite customers — barrel público (ADR-006 / Missão 5.1f).
 * Apps importam daqui; não importar arquivos internos de outro domínio.
 */

export type {
  ClienteInput,
  ClienteListRow,
  ClienteTipo,
} from './types'

export type { CustomerErrorCode, CustomerErrorParams } from './errorCodes'
export { CUSTOMER_ERROR_CODES } from './errorCodes'

export type {
  ClienteAnonymizePayload,
  ClienteExclusionDecision,
  ClienteExclusionFacts,
  CreateClienteCommand,
  CustomerByIdResult,
  CustomerExclusionEffects,
  CustomerExclusionService,
  CustomerReader,
  CustomerReaderById,
  CustomerUpdater,
  CustomerWriter,
  DeleteClienteResult,
  ListClientesPaginadosErr,
  ListClientesPaginadosOk,
  ClienteListaSituacao,
  ListClientesPaginadosQuery,
  ListClientesPaginadosResult,
  SaveClienteCommand,
  SaveClienteResult,
  UpdateClienteCommand,
  ValidateClienteResult,
} from './contracts'

export { validateClienteInput } from './policies/validateClienteInput'
export {
  CLIENTE_ANONIMIZACAO_PAYLOAD,
  CLIENTE_NOME_ANONIMIZADO,
  decideClienteExclusion,
  mensagemCrediarioAberto,
} from './policies/exclusionPolicy'
