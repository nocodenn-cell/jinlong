'use client'

import { setIdiomaAction } from './actions'
import { cn } from '@/lib/utils'
import type { Idioma } from '@/idioma/normalizeIdioma'

type Props = {
  idiomaAtual: Idioma
}

const LANGS: { value: Idioma; label: string; title: string; font?: string }[] = [
  { value: 'pt', label: 'PT', title: 'Português (Brasil)' },
  { value: 'zh', label: '普通话', title: 'Mandarim (简体)', font: '"Noto Sans SC","PingFang SC",sans-serif' },
]

export default function LanguageToggle({ idiomaAtual }: Props) {
  const baseBtn = cn(
    'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
    'bg-secondary text-secondary-foreground border border-border disabled:cursor-default disabled:opacity-55',
  )

  return (
    <form className="flex gap-2 shrink-0" action={setIdiomaAction}>
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
          className={cn(baseBtn, idiomaAtual === value && 'bg-[var(--color-brand)] text-[var(--color-fg-on-brand)] border-transparent disabled:opacity-100')}
          style={font ? { fontFamily: font } : undefined}
        >
          {label}
        </button>
      ))}
    </form>
  )
}