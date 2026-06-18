'use client'

import { setIdiomaAction } from './actions'
import { cn } from '@/lib/utils'
import type { Idioma } from '@/idioma/normalizeIdioma'

type Props = {
  idiomaAtual: Idioma
  /** `dragon`: cabeçalho escuro · `dragon-light`: cabeçalho claro Jīn Lóng */
  variant?: 'default' | 'dragon' | 'dragon-light'
}

const LANGS: { value: Idioma; label: string; title: string; font?: string }[] = [
  { value: 'pt', label: 'PT', title: 'Português (Brasil)' },
  { value: 'zh', label: '普通话', title: 'Mandarim (简体)', font: '"Noto Sans SC","PingFang SC",sans-serif' },
  { value: 'en', label: 'EN', title: 'English (em breve)' },
  { value: 'es', label: 'ES', title: 'Español (em breve)' },
]

export default function LanguageToggle({ idiomaAtual, variant = 'default' }: Props) {
  const baseBtn = cn(
    'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
    'app-btn-neutral disabled:cursor-default disabled:opacity-55',
  )

  return (
    <form className="flex gap-1" action={setIdiomaAction}>
      {LANGS.map(({ value, label, title, font }) => (
        <button
          key={value}
          type="submit"
          name="idioma"
          value={value}
          title={title}
          disabled={idiomaAtual === value}
          className={baseBtn}
          style={font ? { fontFamily: font } : undefined}
        >
          {label}
        </button>
      ))}
    </form>
  )
}
