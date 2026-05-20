import { CaixaPageClient } from "@/app/caixa/CaixaPageClient"
import { getUsuarioIdioma } from "@/idioma/usuarioIdioma"
import { getMessages } from "@/i18n/getMessages"
import { createClient } from "@/lib/supabase/server"

export default async function CaixaPage() {
  const { idioma } = await getUsuarioIdioma()
  const messages = getMessages(idioma)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
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
  const perfil = usuarioData?.perfil ?? 'OPERADOR'

  return <CaixaPageClient messages={messages} idioma={idioma} operadorLabel={operadorLabel} perfil={perfil} />
}
