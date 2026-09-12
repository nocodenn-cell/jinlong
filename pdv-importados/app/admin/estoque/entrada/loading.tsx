/**
 * Esqueleto da Entrada de mercadoria.
 *
 * A página conta, no servidor, quantas entradas estão em andamento (NF-e, OC e
 * remessa). Sem este arquivo a rota fica em branco até as três consultas
 * responderem — o hub some junto, e o operador não sabe se a navegação
 * funcionou.
 */

const CARDS = ['nfe', 'oc', 'remessa'] as const
const PAINEIS = ['pendencias', 'depois'] as const

export default function Loading() {
  return (
    <div className="admin-v2-page" aria-busy="true">
      <div className="mb-4 h-9 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />
      <div className="mb-5 h-16 w-2/3 animate-pulse rounded-lg bg-[var(--color-surface-soft)]" />

      <div className="admin-v2-stack">
        <div className="admin-v2-section-card rounded-card p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {CARDS.map((id) => (
              <div
                key={id}
                className="h-48 animate-pulse rounded-card bg-[var(--color-surface-soft)]"
              />
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {PAINEIS.map((id) => (
            <div
              key={id}
              className="h-52 animate-pulse rounded-card bg-[var(--color-surface-soft)]"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
