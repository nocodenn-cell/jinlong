import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { aplicarTeclaPin, T, TAMANHO_PIN } from './operadorPin'

const tecla: CSSProperties = {
  minHeight: 64,
  fontSize: 24,
  fontWeight: 600,
  borderRadius: 12,
  border: '1px solid #d1d5db',
  background: '#ffffff',
  cursor: 'pointer',
}

/** Teclado numérico de 4 dígitos (toque ou teclado físico). Envia sozinho no 4º dígito. */
export function PinPad({
  onEnviar,
  ocupado,
  erro,
}: {
  onEnviar: (pin: string) => void
  ocupado: boolean
  erro: string | null
}) {
  const [pin, setPin] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  useEffect(() => {
    if (erro) setPin('')
  }, [erro])

  const aplicar = (t: string) => {
    if (ocupado) return
    const r = aplicarTeclaPin(pin, t)
    setPin(r.valor)
    if (r.enviar) {
      onEnviar(r.valor)
      setPin('')
    }
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-testid="pdv-pinpad"
      onKeyDown={(e) => {
        if (/^[0-9]$/.test(e.key) || ['Backspace', 'Enter', 'Delete'].includes(e.key)) {
          e.preventDefault()
          e.stopPropagation()
          aplicar(e.key)
        }
      }}
      style={{ outline: 'none', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}
    >
      <div style={{ fontSize: 14, color: '#374151' }}>{T.digitePin}</div>
      <div aria-label={T.digitePin} aria-live="polite" style={{ display: 'flex', gap: 12 }}>
        {Array.from({ length: TAMANHO_PIN }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              border: '2px solid #111827',
              background: i < pin.length ? '#111827' : 'transparent',
            }}
          />
        ))}
      </div>
      {erro ? (
        <div role="alert" style={{ color: '#b91c1c', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
          {erro}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 84px)', gap: 10 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" style={tecla} disabled={ocupado} onClick={() => aplicar(d)}>
            {d}
          </button>
        ))}
        <button type="button" style={{ ...tecla, fontSize: 12 }} disabled={ocupado} onClick={() => aplicar('Delete')}>
          {T.limpar}
        </button>
        <button type="button" style={tecla} disabled={ocupado} onClick={() => aplicar('0')}>
          0
        </button>
        <button type="button" style={{ ...tecla, fontSize: 12 }} disabled={ocupado} onClick={() => aplicar('Backspace')}>
          {T.apagar}
        </button>
      </div>
    </div>
  )
}
