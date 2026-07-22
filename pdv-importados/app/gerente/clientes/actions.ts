'use server'

import {
  atualizarClienteAction,
  buscarClientesPaginadosAction,
  criarClienteAction,
  excluirClienteAction,
} from '@/app/admin/clientes/actions'

export {
  buscarClientesPaginadosAction,
  criarClienteAction,
  atualizarClienteAction,
  excluirClienteAction,
}

export type ClienteListRow = {
  id: string
  nome: string
  tipo: 'PF' | 'PJ'
  documento: string
  email: string | null
  telefone: string | null
  endereco: string | null
  limite_crediario: number
  saldo_crediario: number
  ultima_compra: string | null
  criado_em: string | null
}

export type ClienteInput = {
  id?: string
  nome: string
  tipo: 'PF' | 'PJ'
  documento: string // somente dígitos
  email: string | null
  telefone: string | null // somente dígitos
  endereco: string | null
  limite_crediario: number
  // Consentimento LGPD — preenchidos apenas na criação de novo cliente
  termos_aceitos_em?: string | null
  consentimento_privacidade_em?: string | null
}

/**
 * Facade legado create/update → Writer/Updater admin (5.1g / 5.1h).
 * Preferir `criarClienteAction` / `atualizarClienteAction` em código novo.
 */
export async function salvarClienteAction(
  input: ClienteInput,
): Promise<{ ok: true; cliente: ClienteListRow } | { ok: false; error: string }> {
  if (!input.id) return criarClienteAction(input)
  return atualizarClienteAction(input)
}
