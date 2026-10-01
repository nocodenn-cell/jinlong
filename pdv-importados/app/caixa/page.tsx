import { redirect } from 'next/navigation'
import { CaixaPageClient } from "@/app/caixa/CaixaPageClient"
import { getUsuarioIdioma } from "@/idioma/usuarioIdioma"
import { getMessages } from "@/i18n/getMessages"
import { clearStaleSessionIfNeeded } from '@/lib/auth/staleSession'
import { createClient } from "@/lib/supabase/server"

export default async function CaixaPage() {
  const { idioma } = await getUsuarioIdioma()
  const messages = getMessages(idioma)
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    if (await clearStaleSessionIfNeeded(supabase, authError)) {
      redirect('/login?reason=sessao_expirada')
    }
    throw authError
  }
  const metaNome =
    typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : ""
  const emailLocalPart = user?.email?.trim()?.split("@")[0]?.trim() ?? ""

  const { data: usuarioData } = user
    ? await supabase.from('usuarios').select('perfil, nome').eq('id', user.id).maybeSingle()
    : { data: null }
  const perfil = usuarioData?.perfil ?? null
  // Nome do funcionário (cadastro) antes do login: quem abre o caixa é identificado pelo nome.
  const nomeCadastro = typeof usuarioData?.nome === "string" ? usuarioData.nome.trim() : ""
  const operadorLabel =
    (metaNome.length > 0 ? metaNome : null) ||
    (nomeCadastro.length > 0 ? nomeCadastro : null) ||
    (emailLocalPart.length > 0 ? emailLocalPart : null) ||
    (user?.id ? user.id.slice(0, 8) : null) ||
    "—"

  return <CaixaPageClient messages={messages} idioma={idioma} operadorLabel={operadorLabel} perfil={perfil} userId={user?.id ?? null} />
}
