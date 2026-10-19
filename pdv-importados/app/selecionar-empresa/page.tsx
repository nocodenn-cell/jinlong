import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROUTES } from '@/lib/navigation/routes'
import { destinoSeguro } from '@/lib/multiempresa/empresaSelecionada'
import { listarEmpresasDoUsuario } from '@/lib/multiempresa/selecionarEmpresa'
import { selecionarEmpresaAction } from './actions'

const ERROS: Record<string, string> = {
  invalida: 'Empresa inválida. / 公司无效。',
  sem_vinculo: 'Você não tem vínculo com essa empresa. / 您未关联该公司。',
  sem_loja: 'Essa empresa não tem loja ativa. / 该公司没有营业门店。',
  gravar: 'Não foi possível trocar de empresa. Tente de novo. / 无法切换公司，请重试。',
}

export default async function SelecionarEmpresaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>
}) {
  const sp = await searchParams
  const next = destinoSeguro(sp.next)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`${ROUTES.auth.login}?next=${encodeURIComponent(next)}`)
  const empresas = await listarEmpresasDoUsuario(supabase, user.id)

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Escolha a empresa / 选择公司</h1>
      {sp.erro && ERROS[sp.erro] ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {ERROS[sp.erro]}
        </p>
      ) : null}
      {empresas.length === 0 ? (
        <p className="text-sm">Nenhum vínculo ativo. Fale com o administrador. / 无有效关联，请联系管理员。</p>
      ) : (
        empresas.map((e) => (
          <form key={e.empresa_id} action={selecionarEmpresaAction}>
            <input type="hidden" name="empresa_id" value={e.empresa_id} />
            <input type="hidden" name="next" value={next} />
            <button type="submit" className="w-full rounded border p-3 text-left hover:bg-gray-50">
              {e.nome ?? e.empresa_id}
            </button>
          </form>
        ))
      )}
    </main>
  )
}
