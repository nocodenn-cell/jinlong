'use client'

import { setIdiomaAction } from './actions'

type Idioma3 = 'pt' | 'zh' | 'zh-HK'

export default function LanguageToggle({ idiomaAtual }: { idiomaAtual: Idioma3 }) {
  return (
    <form action={setIdiomaAction} style={{ display: 'flex', gap: 8 }}>
      <button
        type="submit"
        name="idioma"
        value="pt"
        disabled={idiomaAtual === 'pt'}
        style={{
          padding: '0.35rem 0.65rem',
          borderRadius: 999,
          border: '1px solid #e5e7eb',
          background: idiomaAtual === 'pt' ? '#dcfce7' : '#ffffff',
          color: '#111827',
          cursor: idiomaAtual === 'pt' ? 'default' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        PT
      </button>

      <button
        type="submit"
        name="idioma"
        value="zh"
        title="Mandarim (简体)"
        disabled={idiomaAtual === 'zh'}
        style={{
          padding: '0.35rem 0.65rem',
          borderRadius: 999,
          border: '1px solid #e5e7eb',
          background: idiomaAtual === 'zh' ? '#dcfce7' : '#ffffff',
          color: '#111827',
          cursor: idiomaAtual === 'zh' ? 'default' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: '"Noto Sans SC","PingFang SC",sans-serif',
        }}
      >
        普通话
      </button>

      <button
        type="submit"
        name="idioma"
        value="zh-HK"
        title="廣東話 (繁體)"
        disabled={idiomaAtual === 'zh-HK'}
        style={{
          padding: '0.35rem 0.65rem',
          borderRadius: 999,
          border: '1px solid #e5e7eb',
          background: idiomaAtual === 'zh-HK' ? '#dcfce7' : '#ffffff',
          color: '#111827',
          cursor: idiomaAtual === 'zh-HK' ? 'default' : 'pointer',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: '"Noto Sans TC","MingLiU","Microsoft JhengHei",sans-serif',
        }}
      >
        廣東話
      </button>
    </form>
  )
}

