import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getMessagesForLocaleInput } from '@/i18n/catalogAdapter'
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/passwordPolicy'
import { RedefinirSenhaForm } from './RedefinirSenhaForm'

export default async function RedefinirSenhaPage() {
  const cookieStore = await cookies()
  const idiomaCookie = cookieStore.get('idioma_preferido')?.value
  const { messages, locale } = getMessagesForLocaleInput(idiomaCookie)
  const L = messages.login

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <RedefinirSenhaForm
      locale={locale}
      hasSession={Boolean(user)}
      labels={{
        brandSubtitle: messages.brand.logo_subtitle,
        titulo: L.redefinir_titulo,
        instrucao: L.redefinir_instrucao.replace('{n}', String(PASSWORD_MIN_LENGTH)),
        novaSenha: L.redefinir_nova,
        confirmar: L.redefinir_confirmar,
        salvar: L.redefinir_salvar,
        salvando: L.redefinir_salvando,
        sucesso: L.redefinir_sucesso,
        voltar: L.esqueci_voltar,
        erroSessao: L.redefinir_erro_sessao,
        erroCurta: L.senha_erro_curta,
        erroMismatch: L.senha_erro_mismatch,
        erroGenerico: L.redefinir_erro,
        erroMesmaSenha: L.redefinir_erro_mesma_senha,
        erroFraca: L.redefinir_erro_fraca,
      }}
    />
  )
}
