import { createClient } from '@/lib/supabase/server'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { ClientesFornecedoresGerentePageClient } from './ClientesFornecedoresGerentePageClient'
import type { ContatoGerenteListaRow } from './contatosTypes'

type ClienteDb = {
  id: string
  nome: string
  documento: string | null
  telefone: string | null
  ativo: boolean
}

type FornecedorDb = {
  id: string
  nome: string
  cnpj: string
}

function montarLinhas(clientes: ClienteDb[], fornecedores: FornecedorDb[]): ContatoGerenteListaRow[] {
  const c = clientes.map((row) => ({
    id: row.id,
    tipo: 'CLIENTE' as const,
    nome: row.nome,
    documento: row.documento,
    ativo: row.ativo,
    telefone: row.telefone,
  }))
  const f = fornecedores.map((row) => ({
    id: row.id,
    tipo: 'FORNECEDOR' as const,
    nome: row.nome,
    documento: row.cnpj,
    ativo: null,
    telefone: null,
  }))
  return [...c, ...f].sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' }))
}

export default async function ClientesFornecedoresPage() {
  const { idioma } = await getUsuarioIdioma()
  const supabase = await createClient()
  const [{ data: clientes }, { data: fornecedores }] = await Promise.all([
    supabase.from('clientes').select('id, nome, documento, telefone, ativo').order('nome'),
    supabase.from('fornecedores').select('id, nome, cnpj').order('nome'),
  ])

  const rows = montarLinhas((clientes as ClienteDb[] | null) ?? [], (fornecedores as FornecedorDb[] | null) ?? [])

  return <ClientesFornecedoresGerentePageClient idioma={idioma} rows={rows} />
}
