import { useState } from 'react'
import { PinPad } from './PinPad'
import { mensagemErroPin, T, type OperadorPublico, type ValidarPinResultado } from './operadorPin'

export type AutorizacaoGerente = {
  gerenteId: string
  nome: string
  eventoId: string | null
  offline: boolean
  /** Só quando `percentual` foi pedido. */
  percentual?: number
}

/** PIN do gerente para ação sensível (P0: desconto especial). Funciona offline pelo cache do dispositivo. */
export function GerentePinDialog({
  gerentes,
  acao,
  onAutorizar,
  onConcluir,
  onCancelar,
  percentual,
}: {
  gerentes: OperadorPublico[]
  acao: string
  /** Desconto: depois do PIN pede o % (substitui o segundo prompt()). */
  percentual?: { max: number; inicial: number }
  onAutorizar: (usuarioId: string, pin: string, acao: string) => Promise<ValidarPinResultado>
  onConcluir: (a: AutorizacaoGerente) => void
  onCancelar: () => void
}) {
  const [gerente, setGerente] = useState<OperadorPublico | null>(gerentes.length === 1 ? gerentes[0] : null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [autorizado, setAutorizado] = useState<AutorizacaoGerente | null>(null)
  const [pct, setPct] = useState(percentual ? String(percentual.inicial) : '')
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={T.gerenteTitulo}
      data-testid="pdv-gerente-pin"
      style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(17,24,39,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancelar()
        }
      }}
    >
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', minWidth: 340 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{T.gerenteTitulo}</h2>
        {gerentes.length === 0 ? <div role="alert">{T.semGerente}</div> : null}
        {gerentes.length > 1 ? (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600 }}>
            {T.gerenteEscolha}
            <select
              aria-label={T.gerenteEscolha}
              value={gerente?.usuario_id ?? ''}
              onChange={(e) => {
                setErro(null)
                setGerente(gerentes.find((g) => g.usuario_id === e.target.value) ?? null)
              }}
              style={{ minHeight: 36, borderRadius: 8 }}
            >
              <option value="">—</option>
              {gerentes.map((g) => (
                <option key={g.usuario_id} value={g.usuario_id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
        ) : gerente ? (
          <div style={{ fontWeight: 600 }}>{gerente.nome}</div>
        ) : null}
        {autorizado && percentual ? (
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}
            onSubmit={(e) => {
              e.preventDefault()
              const v = Number(pct.replace(',', '.'))
              if (!Number.isFinite(v) || v < 0 || v > percentual.max) {
                setErro(`Máx. ${percentual.max}% / 最高 ${percentual.max}%`)
                return
              }
              onConcluir({ ...autorizado, percentual: v })
            }}
          >
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              {T.descontoPercent(percentual.max)}
              <input
                autoFocus
                inputMode="decimal"
                aria-label={T.descontoPercent(percentual.max)}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                style={{ display: 'block', marginTop: 6, minHeight: 40, fontSize: 18, width: '100%' }}
              />
            </label>
            {erro ? <div role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{erro}</div> : null}
            <button type="submit" style={{ minHeight: 40, padding: '0 18px', borderRadius: 999, border: 0, background: '#1d4ed8', color: '#fff' }}>
              {T.confirmar}
            </button>
          </form>
        ) : gerente ? (
          <PinPad
            key={gerente.usuario_id}
            ocupado={ocupado}
            erro={erro}
            onEnviar={async (pin) => {
              setOcupado(true)
              try {
                const r = await onAutorizar(gerente.usuario_id, pin, acao)
                if (r.ok) {
                  const a = { gerenteId: gerente.usuario_id, nome: gerente.nome, eventoId: r.evento_id, offline: r.offline }
                  setErro(null)
                  if (percentual) setAutorizado(a)
                  else onConcluir(a)
                } else setErro(mensagemErroPin(r))
              } catch {
                setErro(mensagemErroPin({ erro: null, bloqueado_ate_unix: null }))
              } finally {
                setOcupado(false)
              }
            }}
          />
        ) : null}
        <button type="button" onClick={onCancelar} style={{ minHeight: 40, padding: '0 18px', borderRadius: 999, border: '1px solid #d1d5db', background: '#fff' }}>
          {T.cancelar}
        </button>
      </div>
    </div>
  )
}
