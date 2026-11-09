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
  // Defesa em profundidade: não depende do middleware para negar acesso sem sessão.
  if (!user) {
    redirect('/login?next=%2Fcaixa')
  }
  const metaNome =
    typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : ""
  const emailLocalPart = user?.email?.trim()?.split("@")[0]?.trim() ?? ""

  const { data: usuarioData } = await supabase
    .from('usuarios')
    .select('perfil, nome, ativo, loja_id')
    .eq('id', user.id)
    .maybeSingle()
  // Mesma regra de bloqueio do middleware (adminPolicy): conta desativada, sem loja ou perfil global
  // legado ADMIN (descontinuado: sem acesso de loja) não opera o PDV.
  if (usuarioData?.ativo === false || !usuarioData?.loja_id || usuarioData?.perfil === 'ADMIN') {
    redirect('/login?next=%2Fcaixa')
  }
  const perfil = usuarioData?.perfil ?? null
  // Nome do funcionário (cadastro) primeiro: `user_metadata` é editável pelo próprio usuário, o cadastro não.
  const nomeCadastro = typeof usuarioData?.nome === "string" ? usuarioData.nome.trim() : ""
  const operadorLabel =
    (nomeCadastro.length > 0 ? nomeCadastro : null) ||
    (metaNome.length > 0 ? metaNome : null) ||
    (emailLocalPart.length > 0 ? emailLocalPart : null) ||
    (user?.id ? user.id.slice(0, 8) : null) ||
    "—"

  return <CaixaPageClient messages={messages} idioma={idioma} operadorLabel={operadorLabel} perfil={perfil} userId={user?.id ?? null} />
}
