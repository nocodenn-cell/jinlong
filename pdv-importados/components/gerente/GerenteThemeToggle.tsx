'use client'

import { Sun, Moon } from 'lucide-react'
import { useGerenteUiTheme } from './GerenteThemeContext'
import { cn } from '@/lib/utils'

export function GerenteThemeToggle() {
  const { theme, setTheme } = useGerenteUiTheme()
  const isLight = theme === 'dragon-light'

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? 'dragon-dark' : 'dragon-light')}
      aria-label={isLight ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
      className={cn(
        'w-[30px] h-[30px] rounded-md flex items-center justify-center transition-colors duration-150',
        'text-jl-fg-2 hover:text-jl-fg-1 hover:bg-white/[0.05]',
      )}
    >
      {isLight
        ? <Moon className="w-[15px] h-[15px]" />
        : <Sun className="w-[15px] h-[15px]" />
      }
    </button>
  )
}
