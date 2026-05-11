import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { FormasPagamentoGerentePageClient } from './FormasPagamentoGerentePageClient'
import type { FormaPagamentoRow } from './formasPagamentoTypes'

export default async function FormasPagamentoPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const { data } = await supabase
    .from('formas_pagamento')
    .select('id, codigo, descricao, tipo, ativo')
    .order('codigo', { ascending: true })

  const rows = (data as FormaPagamentoRow[] | null) ?? []

  return <FormasPagamentoGerentePageClient idioma={idioma} rows={rows} />
}

