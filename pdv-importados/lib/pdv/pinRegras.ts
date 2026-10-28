/** Regras do PIN do caixa sem dependência de Node (usáveis no cliente). Hash só em pinOperador.ts (servidor). */
const OBVIOS = new Set([
  '0123', '1234', '2345', '3456', '4567', '5678', '6789', '9876', '8765', '7654', '6543', '5432', '4321', '3210',
  '1212', '1122', '2580', '0852', '1004', '2000', '2001', '1010', '6969',
])

export type ErroPin = 'formato' | 'obvio' | 'confirmacao'

/** Mesma regra de `public.pdv_pin_obvio` no banco. */
export function validarPinNovo(pin: string, confirmacao: string): ErroPin | null {
  if (!/^[0-9]{4}$/.test(pin)) return 'formato'
  if (/^(.)\1{3}$/.test(pin) || OBVIOS.has(pin)) return 'obvio'
  if (pin !== confirmacao) return 'confirmacao'
  return null
}


export type StatusPin = 'sem' | 'ativo' | 'bloqueado'

/** Badge da tela Funcionários. `infinity` (10 erros) e datas futuras = bloqueado. Nunca recebe hash. */
export function statusPin(linha: { pin_bloqueado_ate: string | null } | null | undefined, agora = Date.now()): StatusPin {
  if (!linha) return 'sem'
  const ate = linha.pin_bloqueado_ate
  if (!ate) return 'ativo'
  if (ate === 'infinity') return 'bloqueado'
  const t = Date.parse(ate)
  return Number.isFinite(t) && t > agora ? 'bloqueado' : 'ativo'
}
