import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { createClient } from '@/lib/supabase/server'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { obterKpisCompras, listarOrdensCompra } from './actions'
import { ComprasGerentePageClient } from './ComprasGerentePageClient'

export default async function ComprasGerentePage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)

  const supabase = await createClient()

  const [kpis, inicial, { data: fornecedores }, { data: produtos }] = await Promise.all([
    obterKpisCompras(),
    listarOrdensCompra({ limite: 20, offset: 0 }),
    supabase.from('fornecedores').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('produtos').select('id, nome, unidade_medida').eq('ativo', true).order('nome'),
  ])

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.compras.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">{m.compras.subtitulo}</p>

      <ComprasGerentePageClient
        idioma={idioma}
        kpisIniciais={kpis}
        inicial={inicial}
        fornecedores={(fornecedores ?? []) as Array<{ id: string; nome: string }>}
        produtos={
          (produtos ?? []) as Array<{ id: string; nome: string; unidade_medida: string }>
        }
      />
    </div>
  )
}
