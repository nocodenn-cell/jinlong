import { useEffect, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'

export type AtivacaoStatus = {
  ativado: boolean
  loja_id: string | null
  dispositivo_id: string | null
  endpoint: string | null
  usando_env_legado: boolean
}

function tauriDisponivel(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Primeira abertura do PDV: pede o código de ativação gerado no painel (Admin → Provisionamento).
 * PDVs antigos com SYNC_KEY no `.env` continuam funcionando (modo legado) sem ver esta tela.
 */
export function AtivacaoPdvGate({ children, forceTauri }: { children: ReactNode; forceTauri?: boolean }) {
  const emTauri = forceTauri ?? tauriDisponivel()
  const [status, setStatus] = useState<AtivacaoStatus | null>(null)
  const [codigo, setCodigo] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!emTauri) return
    invoke<AtivacaoStatus>('ativacao_status_cmd')
      .then(setStatus)
      .catch(() => setStatus({ ativado: false, loja_id: null, dispositivo_id: null, endpoint: null, usando_env_legado: false }))
  }, [emTauri])

  if (!emTauri) return <>{children}</>
  if (!status) return null
  if (status.ativado || status.usando_env_legado) return <>{children}</>

  async function ativar() {
    setEnviando(true)
    setErro(null)
    try {
      const r = await invoke<AtivacaoStatus>('ativar_pdv_cmd', {
        codigo,
        endpoint: endpoint.trim() || null,
        nome: nome.trim() || null,
      })
      setStatus(r)
    } catch (e) {
      setErro(typeof e === 'string' ? e : e instanceof Error ? e.message : 'Falha na ativação.')
    } finally {
      setEnviando(false)
    }
  }

  const codigoOk = codigo.replace(/[^A-Za-z0-9]/g, '').length >= 8
  return (
    <div style={{ maxWidth: 440, margin: '10vh auto', fontFamily: 'system-ui', display: 'grid', gap: 12 }}>
      <h1 style={{ fontSize: 22 }}>Ativar este caixa · 激活收银机</h1>
      <p style={{ fontSize: 14, color: '#555' }}>
        Digite o código de ativação gerado no painel (Admin → Provisionamento). Ele vale 24h e uma única vez.
        <br />
        请输入后台生成的激活码（24 小时内有效，仅可使用一次）。
      </p>
      <input
        aria-label="Código de ativação"
        data-testid="ativacao-codigo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        placeholder="XXXX-XXXX-XXXX"
        style={{ fontSize: 24, letterSpacing: 4, padding: 8, textAlign: 'center' }}
        autoFocus
      />
      <input
        aria-label="Nome do caixa"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome deste caixa (opcional) · 收银机名称"
        style={{ padding: 8 }}
      />
      <details>
        <summary style={{ fontSize: 13 }}>Servidor (suporte)</summary>
        <input
          aria-label="Servidor de sincronização"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://<projeto>.supabase.co/functions/v1/sync-outbox"
          style={{ padding: 8, width: '100%', marginTop: 6 }}
        />
      </details>
      {erro && (
        <div role="alert" style={{ color: '#b91c1c', fontSize: 14 }}>
          {erro}
        </div>
      )}
      <button
        type="button"
        data-testid="ativacao-enviar"
        disabled={!codigoOk || enviando}
        onClick={() => void ativar()}
        style={{ padding: 12, fontSize: 16 }}
      >
        {enviando ? 'Ativando…' : 'Ativar · 激活'}
      </button>
    </div>
  )
}
