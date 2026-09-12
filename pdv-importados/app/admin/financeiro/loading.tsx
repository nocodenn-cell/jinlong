/**
 * Esqueleto do Financeiro.
 *
 * É o destino de todo "Ver contas a pagar" do fluxo de entrada. Sem este
 * arquivo, a rota abria numa faixa cinza com "Carregando…" e um vazio branco
 * abaixo — no mobile parecia tela quebrada, e o operador não via nem o
 * cabeçalho nem as abas enquanto as consultas do servidor respondiam.
 */

const KPIS = ['aberto', 'vencidas', 'filtrado', 'docs'] as const
const LINHAS = ['l1', 'l2', 'l3', 'l4', 'l5'] as const

export default function Loading() {
  return (
    <div className="admin-v2-page" aria-busy="true">
      <div className="mb-4 h-9 w-64 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />
      <div className="mb-5 h-5 w-96 max-w-full animate-pulse rounded bg-[var(--color-surface-soft)]" />

      <div className="mb-5 h-10 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />

      <div className="admin-v2-grid-kpi mb-5">
        {KPIS.map((id) => (
          <div
            key={id}
            className="h-32 animate-pulse rounded-card bg-[var(--color-surface-soft)]"
          />
        ))}
      </div>

      <div className="admin-v2-section-card rounded-card p-4">
        <div className="mb-3 h-9 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />
        <div className="space-y-2">
          {LINHAS.map((id) => (
            <div
              key={id}
              className="h-12 animate-pulse rounded bg-[var(--color-surface-soft)]"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
