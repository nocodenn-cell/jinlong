/**
 * Contratos públicos do domínio customers (ports / decisões).
 * Implementações de I/O ficam no adapter da app (Missão 5.1f — fechamento).
 *
 * Leitura: CustomerReader (implementado — Fase 2)
 * Escrita: CustomerWriter | CustomerUpdater | CustomerExclusionService (contratos; CRUD Fase 3)
 */

import type { CustomerErrorCode, CustomerErrorParams } from './errorCodes'
import type { ClienteInput, ClienteListRow } from './types'

export type ValidateClienteResult =
  | { ok: true }
  | { ok: false; code: CustomerErrorCode; error: string }

/** Fatos já obtidos pelo adapter para decidir exclusão (sem I/O aqui). */
export type ClienteExclusionFacts = {
  nome: string
  saldoCrediario: number
  temHistoricoContasReceber: boolean
}

/**
 * Decisão pura de exclusão (LGPD Art. 16 — critérios espelhados da action legada).
 * Adapter / ExclusionService executa o efeito correspondente na infra.
 * `error` = string PT legada; `code` + `params` = resolução i18n na borda.
 */
export type ClienteExclusionDecision =
  | {
      action: 'reject'
      code: CustomerErrorCode
      error: string
      params: CustomerErrorParams
    }
  | { action: 'anonymize' }
  | { action: 'delete' }

/** Payload de anonimização — valores idênticos à action legada. */
export type ClienteAnonymizePayload = {
  nome: 'CLIENTE_ANONIMIZADO_LGPD'
  documento: null
  telefone: null
  email: null
  endereco: null
  ativo: false
}

// ─── Leitura ───────────────────────────────────────────────────────────────

/** Port de leitura paginada (cross-domínio, ex.: financeiro). */
export type ListClientesPaginadosQuery = {
  page: number
  termo?: string
}

export type ListClientesPaginadosOk = {
  ok: true
  clientes: ClienteListRow[]
  hasMore: boolean
}

export type ListClientesPaginadosErr = {
  ok: false
  error: string
}

export type ListClientesPaginadosResult = ListClientesPaginadosOk | ListClientesPaginadosErr

/**
 * Port de leitura do domínio customers.
 * Implementado: `pdv-importados/app/admin/clientes/customerReader.ts` (Fase 2).
 */
export type CustomerReader = {
  listPaginados(query: ListClientesPaginadosQuery): Promise<ListClientesPaginadosResult>
}

/** Relê um cliente pela view (campos computados pós-write). */
export type CustomerByIdResult =
  | { ok: true; cliente: ClienteListRow }
  | { ok: false; error: string }

export type CustomerReaderById = {
  getById(id: string): Promise<CustomerByIdResult>
}

// ─── Escrita (create / update) ─────────────────────────────────────────────

export type SaveClienteResult =
  | { ok: true; cliente: ClienteListRow }
  | {
      ok: false
      error: string
      code?: CustomerErrorCode
      params?: CustomerErrorParams
    }

/**
 * @deprecated Preferir CreateClienteCommand + UpdateClienteCommand (split Writer/Updater).
 * Mantido para compatibilidade tipada com a action legada `salvarClienteAction`.
 */
export type SaveClienteCommand = ClienteInput

/** Create — espelha INSERT legado (loja_id + consent LGPD opcional). */
export type CreateClienteCommand = {
  /** Input sem `id` (create). Se `id` vier preenchido, o adapter deve rejeitar. */
  input: ClienteInput
  /** Obrigatório — `clientes.loja_id` NOT NULL. */
  lojaId: string
}

/**
 * Port de criação.
 * Adapter: INSERT `clientes` → relê `v_clientes_gerente`.
 * Policy pré-write: `validateClienteInput` (shared-core).
 */
export type CustomerWriter = {
  create(command: CreateClienteCommand): Promise<SaveClienteResult>
}

/** Update — espelha UPDATE legado por id. */
export type UpdateClienteCommand = {
  id: string
  input: ClienteInput
}

/**
 * Port de atualização.
 * Adapter: UPDATE `clientes` → relê `v_clientes_gerente`.
 * Policy pré-write: `validateClienteInput` (shared-core).
 * Consent LGPD de create **não** se reaplica no update (regra legada).
 */
export type CustomerUpdater = {
  update(command: UpdateClienteCommand): Promise<SaveClienteResult>
}

// ─── Exclusão (LGPD) ───────────────────────────────────────────────────────

export type DeleteClienteResult =
  | { ok: true; anonimizado?: boolean }
  | {
      ok: false
      error: string
      code?: CustomerErrorCode
      params?: CustomerErrorParams
    }

/**
 * Efeitos de persistência da exclusão — só I/O (adapter).
 * A decisão reject|anonymize|delete vem de `decideClienteExclusion`.
 */
export type CustomerExclusionEffects = {
  loadExclusionFacts(
    id: string,
  ): Promise<
    | { ok: true; facts: ClienteExclusionFacts }
    | { ok: false; error: string; notFound?: boolean }
  >
  anonymize(id: string): Promise<{ ok: true } | { ok: false; error: string }>
  deletePhysical(id: string): Promise<{ ok: true } | { ok: false; error: string }>
}

/**
 * Serviço de exclusão (orquestra fatos → policy pura → efeito).
 *
 * Fluxo alvo (Fase 3):
 * 1. `effects.loadExclusionFacts(id)`
 * 2. se notFound → `{ ok: false, error: 'Cliente não encontrado.' }`
 * 3. `decideClienteExclusion(facts)` (shared-core)
 * 4. reject | anonymize | deletePhysical
 *
 * Implementação: adapter app — **não** migrar CRUD nesta missão.
 */
export type CustomerExclusionService = {
  exclude(id: string): Promise<DeleteClienteResult>
}
