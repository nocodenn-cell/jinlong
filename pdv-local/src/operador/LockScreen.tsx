import { useState } from 'react'
import { PinPad } from './PinPad'
import { iniciais, mensagemErroPin, T, type OperadorPublico, type ValidarPinResultado } from './operadorPin'

/** Tela de bloqueio: escolhe o operador e digita o PIN. Cobre a tela; carrinho e caixa ficam intactos por trás. */
export function LockScreen({
  operadores,
  temCarrinho,
  onEntrar,
}: {
  operadores: OperadorPublico[]
  temCarrinho: boolean
  onEntrar: (usuarioId: string, pin: string) => Promise<ValidarPinResultado>
}) {
  const [escolhido, setEscolhido] = useState<OperadorPublico | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const comPin = operadores.filter((o) => o.tem_pin)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={T.telaTitulo}
      data-testid="pdv-lockscreen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(243,244,246,0.98)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 22, margin: 0 }}>{escolhido ? escolhido.nome : T.telaTitulo}</h1>
      {temCarrinho ? <div style={{ fontSize: 13, color: '#166534' }}>{T.carrinhoMantido}</div> : null}
      {!escolhido ? (
        comPin.length === 0 ? (
          <div role="alert">{T.nenhumComPin}</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 720 }}>
            {operadores.map((o) => (
              <button
                key={o.usuario_id}
                type="button"
                data-testid="pdv-lock-operador"
                disabled={!o.tem_pin}
                title={o.tem_pin ? o.nome : T.semPin}
                onClick={() => {
                  setErro(null)
                  setEscolhido(o)
                }}
                style={{
                  width: 132,
                  minHeight: 120,
                  borderRadius: 16,
                  border: '1px solid #d1d5db',
                  background: o.tem_pin ? '#ffffff' : '#f3f4f6',
                  color: o.tem_pin ? '#111827' : '#9ca3af',
                  cursor: o.tem_pin ? 'pointer' : 'default',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    background: o.tem_pin ? '#1d4ed8' : '#d1d5db',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 18,
                  }}
                >
                  {iniciais(o.nome)}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'center' }}>{o.nome}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <PinPad
            ocupado={ocupado}
            erro={erro}
            onEnviar={async (pin) => {
              setOcupado(true)
              try {
                const r = await onEntrar(escolhido.usuario_id, pin)
                if (!r.ok) setErro(mensagemErroPin(r))
              } catch {
                setErro(mensagemErroPin({ erro: null, bloqueado_ate_unix: null }))
              } finally {
                setOcupado(false)
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              setEscolhido(null)
              setErro(null)
            }}
            style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff' }}
          >
            {T.voltar}
          </button>
        </>
      )}
    </div>
  )
}
