import { CaixaPageClient } from "@/app/caixa/CaixaPageClient"
import { getUsuarioIdioma } from "@/src/lib/idioma/usuarioIdioma"
import { getMessages } from "@/src/lib/i18n/getMessages"

export default async function CaixaPage() {
  const { idioma } = await getUsuarioIdioma()
  const messages = getMessages(idioma)

  return <CaixaPageClient messages={messages} idioma={idioma} />
}
