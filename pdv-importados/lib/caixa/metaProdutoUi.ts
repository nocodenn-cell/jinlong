import type { Mensagens } from '@/i18n/getMessages'
import type { MetaProdutoPdv } from '../../shared/cart/types'

export function labelOrigemCaixa(
  origem: MetaProdutoPdv['origem'],
  m: Mensagens,
): string {
  if (origem === 'china_manual') return m.caixa.origem_china_manual
  if (origem === 'brasil_nf') return m.caixa.origem_brasil_nf
  return m.caixa.origem_brasil_sem_nf
}

export function truncarObservacaoCaixa(texto: string | null | undefined, max = 72): string {
  if (texto == null) return ''
  const t = texto.trim()
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}
