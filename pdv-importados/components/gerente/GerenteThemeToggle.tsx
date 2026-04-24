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
  const isDark = theme === 'dragon-dark'
  const isLight = theme === 'dragon-light'
  const chromeLight = isGerenteLightChrome(theme)

  return (
    <div
      className={cn(
        'inline-flex rounded-lg p-0.5 shadow-sm backdrop-blur-sm',
        chromeLight
          ? 'border border-slate-300/90 bg-white/85'
          : 'border border-slate-600/50 bg-slate-950/40',
      )}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => setTheme('dragon-dark')}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
          isDark
            ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-500/40'
            : chromeLight
              ? 'text-slate-600 hover:bg-slate-100 hover:text-amber-800'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-amber-200',
        )}
      >
        {labelDark}
      </button>
      <button
        type="button"
        onClick={() => setTheme('dragon-light')}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
          isLight
            ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-400/60'
            : chromeLight
              ? 'text-slate-600 hover:bg-slate-100 hover:text-amber-800'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-amber-200',
        )}
      >
        {labelLight}
      </button>
    </div>
  )
}