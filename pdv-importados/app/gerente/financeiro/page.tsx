import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { FinanceiroGerentePageClient } from './FinanceiroGerentePageClient'

export default async function FinanceiroPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data: clientes } = await supabase.from('clientes').select('id, nome').eq('ativo', true).order('nome')
  const { data: titulosRaw } = await supabase
    .from('contas_receber')
    .select('id, valor_total, valor_aberto, status, descricao, cliente_id, clientes(nome)')
    .in('status', ['ABERTO', 'PARCIAL'])
    .order('created_at', { ascending: false })
    .limit(50)
  const { data: docsFiscais } = await supabase
    .from('documentos_fiscais_pendentes')
    .select('id, venda_id, tipo_doc, status, tentativas, ultimo_erro')
    .order('created_at', { ascending: false })
    .limit(30)

  const titulos = (titulosRaw ?? []).map((t) => {
    const cn = t.clientes as { nome?: string } | { nome?: string }[] | null
    const nomeCliente = Array.isArray(cn) ? cn[0]?.nome : cn?.nome
    return {
      id: t.id,
      valor_total: Number(t.valor_total),
      valor_aberto: Number(t.valor_aberto),
      status: t.status,
      descricao: t.descricao,
      cliente_id: t.cliente_id,
      cliente_nome: nomeCliente ?? null,
    }
  })

  return (
    <FinanceiroGerentePageClient
      idioma={idioma}
      clientes={clientes ?? []}
      titulos={titulos}
      docsFiscais={docsFiscais ?? []}
    />
  )
}
