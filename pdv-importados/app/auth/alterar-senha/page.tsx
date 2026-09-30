import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getMessagesForLocaleInput } from '@/i18n/catalogAdapter'
import { destinoPosLoginPorPerfil } from '@/lib/auth/painelGerencial'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/passwordPolicy'
import { ROUTES } from '@/lib/navigation/routes'
import { AlterarSenhaForm } from './AlterarSenhaForm'

export default async function AlterarSenhaPage() {
  const cookieStore = await cookies()
  const idiomaCookie = cookieStore.get('idioma_preferido')?.value
  const { messages, locale } = getMessagesForLocaleInput(idiomaCookie)
  const L = messages.login

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`${ROUTES.auth.login}?next=${encodeURIComponent(ROUTES.auth.changePassword)}`)
  }

  const { data: perfilRow } = await supabase
    .from('usuarios')
    .select('perfil')
    .eq('id', user.id)
    .maybeSingle()

  const backHref = destinoPosLoginPorPerfil(perfilRow?.perfil, {
    caixaHome: ROUTES.caixa.home,
    adminDashboard: ROUTES.admin.dashboard,
  })

  return (
    <AlterarSenhaForm
      locale={locale}
      email={user.email ?? ''}
      backHref={backHref}
      labels={{
        brandSubtitle: messages.brand.logo_subtitle,
        titulo: L.alterar_titulo,
        instrucao: L.alterar_instrucao.replace('{n}', String(PASSWORD_MIN_LENGTH)),
        atual: L.alterar_atual,
        nova: L.alterar_nova,
        confirmar: L.alterar_confirmar,
        salvar: L.alterar_salvar,
        salvando: L.alterar_salvando,
        sucesso: L.alterar_sucesso,
        voltar: L.alterar_voltar,
        erroAtual: L.alterar_erro_atual,
        erroCurta: L.senha_erro_curta,
        erroMismatch: L.senha_erro_mismatch,
        erroGenerico: L.alterar_erro,
        erroEmail: L.alterar_erro_email,
      }}
    />
  )
}
