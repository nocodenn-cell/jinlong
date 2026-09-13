import { redirect } from 'next/navigation'
import { CaixaPageClient } from "@/app/caixa/CaixaPageClient"
import { carregarBootstrapCaixa } from "@/app/caixa/actions"
import { getMessages } from "@/i18n/getMessages"
import { normalizeIdioma } from "@/idioma/normalizeIdioma"
import { getRawSession } from "@/lib/admin/auth/sessionConsistency"

export default async function CaixaPage() {
  // Uma verificação de sessão + uma leitura de perfil por request (cache
  // compartilhado com as impls chamadas neste render). Antes: getUsuarioIdioma,
  // um segundo auth.getUser() e uma segunda leitura de `usuarios.perfil`.
  const raw = await getRawSession()
  if (raw.status === 'stale') {
    redirect('/login?reason=sessao_expirada')
  }
  if (raw.status === 'auth_error' || raw.status === 'db_error') {
    throw raw.error
  }

  const autenticado = raw.status === 'authenticated' ? raw : null
  const user = autenticado?.user ?? null
  const idioma = normalizeIdioma(autenticado?.usuario?.idioma_preferido)
  const messages = getMessages(idioma)

  const metaNome =
    typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : ""
  const emailLocalPart = user?.email?.trim()?.split("@")[0]?.trim() ?? ""
  const operadorLabel =
    (metaNome.length > 0 ? metaNome : null) ||
    (emailLocalPart.length > 0 ? emailLocalPart : null) ||
    (user?.id ? user.id.slice(0, 8) : null) ||
    "—"

  const perfil = autenticado?.usuario?.perfil ?? null

  // Dados de abertura do PDV no mesmo request e em paralelo, em vez de 5 Server
  // Actions disparadas pelo cliente após a hidratação (serializadas pelo runtime).
  const bootstrap = user ? await carregarBootstrapCaixa() : null

  return (
    <CaixaPageClient
      messages={messages}
      idioma={idioma}
      operadorLabel={operadorLabel}
      perfil={perfil}
      userId={user?.id ?? null}
      bootstrap={bootstrap}
    />
  )
}
