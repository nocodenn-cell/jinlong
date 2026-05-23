import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { createClient } from '@/lib/supabase/server'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { obterListaEstoqueGerente, obterKpisEstoque } from '@/app/gerente/estoque/actions'
import { RelatorioEstoqueClient } from './RelatorioEstoqueClient'

export default async function RelatorioEstoquePage() {
  const { idioma } = await getUsuarioIdioma()
  const locale = localeFromIdioma(idioma)
  const m = getMessages(idioma)

  const supabase = await createClient()

  const [kpis, inicial, { data: categorias }] = await Promise.all([
    obterKpisEstoque(),
    obterListaEstoqueGerente({ visao: 'geral', busca: '', categoria_id: null, origem: '', ordem: 'nome', dir_asc: true, limite: 20, offset: 0 }),
    supabase.from('categorias').select('id, nome').eq('ativo', true).order('nome'),
  ])

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.relatorios_estoque.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">{m.relatorios_estoque.subtitulo}</p>

      <RelatorioEstoqueClient
        idioma={idioma}
        locale={locale}
        kpisIniciais={kpis}
        inicial={inicial}
        categorias={(categorias ?? []) as Array<{ id: string; nome: string }>}
      />
    </div>
  )
}
