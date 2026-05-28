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
  const operadorLabel =
    (user?.email?.trim() && user.email.trim()) ||
    (metaNome.length > 0 ? metaNome : null) ||
    (user?.id ? user.id.slice(0, 8) : null) ||
    "—"

  const { data: usuarioData } = user
    ? await supabase.from('usuarios').select('perfil').eq('id', user.id).maybeSingle()
    : { data: null }
  const perfil = usuarioData?.perfil ?? null

  return <CaixaPageClient messages={messages} idioma={idioma} operadorLabel={operadorLabel} perfil={perfil} userId={user?.id ?? null} />
}
