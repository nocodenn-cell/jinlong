'use client'

import { setIdiomaAction } from './actions'
import { cn } from '@/lib/utils'

type Idioma3 = 'pt' | 'zh' | 'zh-HK'

type Props = {
  idiomaAtual: Idioma3
  /** `dragon`: cabeçalho escuro · `dragon-light`: cabeçalho claro Jīn Lóng */
  variant?: 'default' | 'dragon' | 'dragon-light'
}

export default function LanguageToggle({ idiomaAtual, variant = 'default' }: Props) {
  const dragon = variant === 'dragon'
  const dragonLight = variant === 'dragon-light'

  const baseBtn = cn(
    'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
    dragon &&
      'app-btn-neutral disabled:cursor-default disabled:opacity-55',
    dragonLight &&
      'app-btn-neutral disabled:cursor-default disabled:opacity-55',
    !dragon &&
      !dragonLight &&
      'app-btn-neutral disabled:cursor-default disabled:opacity-55',
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
