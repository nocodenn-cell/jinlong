import { caixaFmt, type CaixaMessages } from '@/app/caixa/caixaI18n'

/**
 * Mensagem de "venda registrada". Quando a RPC gerou uma conta a receber
 * (`contasRecebeId`: pagamento parcial com cliente), a mensagem cita o título —
 * antes a consequência existia no retorno da RPC, mas o operador só a
 * descobria depois, na ficha do cliente.
 */
export function mensagemVendaOk(
  m: Pick<CaixaMessages, 'msg_venda_ok' | 'msg_venda_ok_com_titulo'>,
  opts: {
    vendaId: string
    contasRecebeId?: string | null
    /** Valor a receber já formatado (sem símbolo de moeda). */
    saldoAReceber: string
    clienteNome?: string | null
  },
): string {
  const id = opts.vendaId.slice(0, 8)
  if (!opts.contasRecebeId) return caixaFmt(m.msg_venda_ok, { id })
  return caixaFmt(m.msg_venda_ok_com_titulo, {
    id,
    valor: opts.saldoAReceber,
    cliente: opts.clienteNome?.trim() || '—',
  })
}
