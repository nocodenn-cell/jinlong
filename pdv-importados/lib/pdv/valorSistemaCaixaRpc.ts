import { createClient } from '@/lib/supabase/server'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

export async function calcularValorSistemaDinheiroCaixa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caixaId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('calcular_valor_sistema_dinheiro_caixa', {
    p_caixa_id: caixaId,
  })

  if (error) {
    throw new Error(mensagemErroComSecao('Valor sistema (caixa)', error.message))
  }

  const n = typeof data === 'string' ? Number.parseFloat(data) : Number(data)
  if (!Number.isFinite(n)) {
    throw new Error(mensagemErroComSecao('Valor sistema (caixa)', 'Resposta inválida do servidor.'))
  }
  return roundMoney2(n)
}
