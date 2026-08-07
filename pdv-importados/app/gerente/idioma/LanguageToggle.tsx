'use client'

import { setIdiomaAction } from './actions'
import { Button } from '@/components/ui/button'
import type { Idioma } from '@/idioma/normalizeIdioma'

type Props = {
  idiomaAtual: Idioma
  /** Mantido por compat API (AdminV2UtilityBar). */
  variant?: 'default' | 'dragon' | 'dragon-light'
}

const LANGS: { value: Idioma; label: string; title: string; font?: string }[] = [
  { value: 'pt', label: 'PT', title: 'Português (Brasil)' },
  { value: 'zh', label: '普通话', title: 'Mandarim (简体)', font: '"Noto Sans SC","PingFang SC",sans-serif' },
]

export default function LanguageToggle({ idiomaAtual }: Props) {
  return (
    <form className="flex gap-1" action={setIdiomaAction}>
      {LANGS.map(({ value, label, title, font }) => (
        <Button
          key={value}
          type="submit"
          name="idioma"
          value={value}
          title={title}
          disabled={idiomaAtual === value}
          variant="secondary"
          size="sm"
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={font ? { fontFamily: font } : undefined}
        >
          {label}
        </Button>
      ))}
    </form>
  )
}
