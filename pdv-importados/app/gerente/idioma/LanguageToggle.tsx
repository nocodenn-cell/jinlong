'use client'

import { setIdiomaAction } from './actions'
import { cn } from '@/lib/utils'
import type { Idioma } from '@/idioma/normalizeIdioma'

type Props = {
  idiomaAtual: Idioma
  /**
   * `dragon`: cabeçalho escuro · `dragon-light`: cabeçalho claro Jīn Lóng.
   * Aceito na API (GerenteHeaderNav passa `dragon`) mas ainda não altera o
   * estilo — o botão usa tokens `app-btn-neutral` que já adaptam ao tema.
   */
  variant?: 'default' | 'dragon' | 'dragon-light'
}

const LANGS: { value: Idioma; label: string; title: string; font?: string }[] = [
  { value: 'pt', label: 'PT', title: 'Português (Brasil)' },
  { value: 'zh', label: '普通话', title: 'Mandarim (简体)', font: '"Noto Sans SC","PingFang SC",sans-serif' },
]

/**
 * Troca de idioma = documento novo. Depois de persistir, recarrega a página
 * em vez de reconciliar a árvore /admin inteira no cliente: o SSR já sai no
 * idioma novo e o tempo não depende de CPU nem de prefetch (ver `actions.ts`).
 * Sem `ok` (sessão inválida, erro do banco) não recarrega — o botão continua
 * clicável.
 */
export async function trocarIdioma(formData: FormData): Promise<void> {
  const { ok } = await setIdiomaAction(formData)
  if (ok) window.location.reload()
}

export default function LanguageToggle({ idiomaAtual }: Props) {
  const baseBtn = cn(
    'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
    'app-btn-neutral disabled:cursor-default disabled:opacity-55',
  )

  return (
    <form className="flex gap-1" action={trocarIdioma}>
      {LANGS.map(({ value, label, title, font }) => (
        <button
          key={value}
          type="submit"
          name="idioma"
          value={value}
          title={title}
          disabled={idiomaAtual === value}
          aria-pressed={idiomaAtual === value}
          data-active={idiomaAtual === value}
          className={cn(baseBtn, idiomaAtual === value && 'bg-[var(--color-brand)] text-[var(--color-brand-fg)] border-transparent disabled:opacity-100')}
          style={font ? { fontFamily: font } : undefined}
        >
          {label}
        </button>
      ))}
    </form>
  )
}
