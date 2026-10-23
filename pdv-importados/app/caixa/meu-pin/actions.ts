'use server'

import { createClient } from '@/lib/supabase/server'
import { derivarPinHash, validarPinNovo, type ErroPin } from '@/lib/pdv/pinOperador'

export type PinEquipeLinha = {
  usuario_id: string
  nome: string
  papel: string
  eu: boolean
  tem_pin: boolean
  bloqueado: boolean
}

type Resultado<T = undefined> = { ok: true; data?: T } | { ok: false; erro: ErroPin | 'sessao' | 'permissao' | 'indisponivel' }

// RPCs novas (migration 20261021230000) ainda fora do database.types gerado.
type RpcLivre = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>

async function rpc() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { user, call: supabase.rpc.bind(supabase) as unknown as RpcLivre }
}

export async function listarPinsEquipeAction(): Promise<Resultado<PinEquipeLinha[]>> {
  const { user, call } = await rpc()
  if (!user) return { ok: false, erro: 'sessao' }
  const { data, error } = await call('status_pin_equipe_pdv')
  if (error) return { ok: false, erro: 'indisponivel' }
  return { ok: true, data: (data ?? []) as PinEquipeLinha[] }
}

/** O PIN em claro só passa por aqui (servidor) para virar hash; nunca vai ao banco nem a log. */
export async function definirMeuPinAction(pin: string, confirmacao: string): Promise<Resultado> {
  const erro = validarPinNovo(String(pin ?? '').trim(), String(confirmacao ?? '').trim())
  if (erro) return { ok: false, erro }
  const { user, call } = await rpc()
  if (!user) return { ok: false, erro: 'sessao' }
  const h = derivarPinHash(String(pin).trim())
  const { error } = await call('definir_meu_pin_pdv', { p_hash: h.hash, p_salt: h.salt, p_iteracoes: h.iteracoes })
  if (error) return { ok: false, erro: error.code === '42501' ? 'permissao' : 'indisponivel' }
  return { ok: true }
}

export async function resetarPinOperadorAction(usuarioId: string): Promise<Resultado> {
  const { user, call } = await rpc()
  if (!user) return { ok: false, erro: 'sessao' }
  const { error } = await call('resetar_pin_operador_pdv', { p_usuario: usuarioId })
  if (error) return { ok: false, erro: error.code === '42501' ? 'permissao' : 'indisponivel' }
  return { ok: true }
}
