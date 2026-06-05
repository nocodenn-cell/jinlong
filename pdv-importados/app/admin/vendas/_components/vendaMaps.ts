/**
 * FastProduct Admin — Vendas · mapeamentos de badge (Fase 5)
 *
 * Funções puras (sem estado/query) que traduzem os códigos persistidos no banco
 * para os tipos dos badges da Fase 2. Compartilhadas entre VendasTable e
 * VendaDetailSheet.
 */

import type { Payment } from '@/components/ui/badges'
import type { VendaStatus } from '@/components/ui/badges'
import type { Fiscal } from '@/components/ui/badges'

const PAYMENT_MAP: Record<string, Payment> = {
  DINHEIRO: 'DINHEIRO',
  PIX: 'PIX',
  CARTAO_CREDITO: 'CREDITO',
  CARTAO_DEBITO: 'DEBITO',
  CARTAO: 'CARTAO',
  OUTRO: 'OUTRO',
  OUTROS: 'OUTRO',
}

/** Código de forma de pagamento → tipo do PaymentBadge (default OUTRO). */
export function toPayment(raw: string | null | undefined): Payment {
  return PAYMENT_MAP[String(raw ?? '').trim().toUpperCase()] ?? 'OUTRO'
}

const STATUS_MAP: Record<string, VendaStatus> = {
  CONCLUIDA: 'CONCLUIDA',
  CANCELADA: 'CANCELADA',
  PENDENTE: 'PENDENTE',
  DEVOLVIDA: 'DEVOLVIDA',
}

/** Status persistido → VendaStatus, ou null se desconhecido (renderiza fallback). */
export function toVendaStatus(raw: string | null | undefined): VendaStatus | null {
  return STATUS_MAP[String(raw ?? '').trim().toUpperCase()] ?? null
}

/** Situação fiscal derivada do número da NF (não há coluna fiscal dedicada). */
export function toFiscal(numeroNf: string | null | undefined): Fiscal {
  return numeroNf && String(numeroNf).trim() ? 'EMITIDA' : 'SEM_NOTA'
}
