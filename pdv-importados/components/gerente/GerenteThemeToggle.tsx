'use client'

import { useGerenteUiTheme } from './GerenteThemeContext'
import { isGerenteLightChrome } from './gerenteUiTheme'
import { cn } from '@/lib/utils'

type Props = Readonly<{
  labelDark: string
  labelLight: string
  ariaLabel: string
}>

export function GerenteThemeToggle({ labelDark, labelLight, ariaLabel }: Props) {
  const { theme, setTheme } = useGerenteUiTheme()
  const isDark = theme === 'noturno'
  const isLight = theme === 'novem'
  const chromeLight = isGerenteLightChrome(theme)

  return (
    <fieldset
      className={cn(
        'inline-flex rounded-lg p-0.5 shadow-sm backdrop-blur-sm',
        'border app-border app-surface-soft',
      )}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => setTheme('noturno')}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
          isDark
            ? 'app-surface-soft app-accent-text ring-1 ring-[color:var(--accent)]'
            : chromeLight
              ? 'app-muted hover:app-surface hover:app-accent-text'
              : 'app-muted hover:app-surface hover:app-accent-text',
        )}
      >
        {labelDark}
      </button>
      <button
        type="button"
        onClick={() => setTheme('novem')}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
          isLight
            ? 'app-surface-soft app-accent-text ring-1 ring-[color:var(--accent)]'
            : chromeLight
              ? 'app-muted hover:app-surface hover:app-accent-text'
              : 'app-muted hover:app-surface hover:app-accent-text',
        )}
      >
        {labelLight}
      </button>
    </fieldset>
  )
}