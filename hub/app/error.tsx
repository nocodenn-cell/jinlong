'use client'

/**
 * Error boundary do hub. Erros de servidor chegam aqui com `digest` (o log completo fica na Vercel).
 * Não exibe a mensagem bruta do erro: pode conter detalhes internos.
 */
export default function HubError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="hub-login" style={{ textAlign: 'center', gap: 16 }}>
      <h1>Algo deu errado</h1>
      <p>Não foi possível carregar esta página. Tente de novo ou volte ao painel.</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="hub-btn" onClick={() => reset()}>Tentar de novo</button>
        <a className="hub-link" href="/">Ir ao painel</a>
      </div>
    </main>
  )
}
