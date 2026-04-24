'use client'

import { setIdiomaAction } from './actions'
import { cn } from '@/lib/utils'

type Idioma3 = 'pt' | 'zh' | 'zh-HK'

type Props = {
  idiomaAtual: Idioma3
  /** `dragon`: cabeçalho escuro · `dragon-light`: cabeçalho claro Dragon POS */
  variant?: 'default' | 'dragon' | 'dragon-light'
}

export default function LanguageToggle({ idiomaAtual, variant = 'default' }: Props) {
  const dragon = variant === 'dragon'
  const dragonLight = variant === 'dragon-light'

  const baseBtn = cn(
    'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
    dragon &&
      'border border-slate-600/80 bg-slate-900/50 text-slate-200 hover:border-amber-500/50 hover:text-amber-300 disabled:cursor-default disabled:border-amber-500/60 disabled:bg-amber-500/15 disabled:text-amber-200',
    dragonLight &&
      'border border-slate-300/90 bg-white/90 text-slate-800 hover:border-amber-500/50 hover:text-amber-800 disabled:cursor-default disabled:border-amber-400/70 disabled:bg-amber-50/90 disabled:text-amber-950',
    !dragon &&
      !dragonLight &&
      'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 disabled:cursor-default disabled:border-emerald-300 disabled:bg-emerald-50',
  )

  return (
    <form className="flex gap-2" action={setIdiomaAction}>
      <button type="submit" name="idioma" value="pt" disabled={idiomaAtual === 'pt'} className={baseBtn}>
        PT
      </button>

      <button
        type="submit"
        name="idioma"
        value="zh"
        title="Mandarim (简体)"
        disabled={idiomaAtual === 'zh'}
        className={baseBtn}
        style={{ fontFamily: '"Noto Sans SC","PingFang SC",sans-serif' }}
      >
        普通话
      </button>

      <button
        type="submit"
        name="idioma"
        value="zh-HK"
        title="廣東話 (繁體)"
        disabled={idiomaAtual === 'zh-HK'}
        className={baseBtn}
        style={{ fontFamily: '"Noto Sans TC","MingLiU","Microsoft JhengHei",sans-serif' }}
      >
        廣東話
      </button>
    </form>
  )
}
