import { setIdiomaPreLoginAction } from './actions'
import type { Idioma } from '@/src/lib/idioma/normalizeIdioma'

type Props = {
  idiomaAtual: Idioma
  label: string
}

const IDIOMAS: { value: Idioma; texto: string; lang: string }[] = [
  { value: 'pt', texto: 'Português', lang: 'pt-BR' },
  { value: 'zh', texto: '简体中文', lang: 'zh-CN' },
]

/**
 * Seletor de idioma da tela de login (antes da autenticação).
 * Usa server action em `form` — funciona sem JS e revalida a página ao trocar.
 */
export function LoginLanguageSwitch({ idiomaAtual, label }: Props) {
  return (
    <form action={setIdiomaPreLoginAction} className="login-lang-switch" role="group" aria-label={label}>
      {IDIOMAS.map(({ value, texto, lang }) => {
        const ativo = idiomaAtual === value
        return (
          <button
            key={value}
            type="submit"
            name="idioma"
            value={value}
            lang={lang}
            aria-pressed={ativo}
            data-active={ativo ? 'true' : undefined}
            className="login-lang-switch__btn"
          >
            {texto}
          </button>
        )
      })}
    </form>
  )
}
