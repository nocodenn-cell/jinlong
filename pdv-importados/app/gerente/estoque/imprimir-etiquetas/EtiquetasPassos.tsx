export type PassoEtiqueta = 1 | 2 | 3 | 4

type Props = {
  passo: PassoEtiqueta
  rotulos: readonly string[]
  contador: string
  podeAvancar: boolean
  onIr: (passo: PassoEtiqueta) => void
}

export function EtiquetasPassos({ passo, rotulos, contador, podeAvancar, onIr }: Props) {
  return (
    <div>
      <p className="mb-2 text-caption font-medium text-fg-subtle">{contador}</p>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={contador}>
      {rotulos.map((rotulo, index) => (
        <PassoItem
          key={rotulo}
          numero={(index + 1) as PassoEtiqueta}
          rotulo={rotulo}
          ativo={passo === index + 1}
          bloqueado={index + 1 > passo && !podeAvancar}
          onIr={onIr}
        />
      ))}
      </ol>
    </div>
  )
}

function PassoItem({
  numero,
  rotulo,
  ativo,
  bloqueado,
  onIr,
}: {
  numero: PassoEtiqueta
  rotulo: string
  ativo: boolean
  bloqueado: boolean
  onIr: (passo: PassoEtiqueta) => void
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={ativo ? 'step' : undefined}
        disabled={bloqueado}
        onClick={() => onIr(numero)}
        className={
          ativo
            ? 'fp-focus-ring flex min-h-14 w-full items-center gap-2 rounded-lg border border-brand/40 bg-[var(--color-info-bg)] px-3 py-2 text-left'
            : 'fp-focus-ring flex min-h-14 w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left disabled:opacity-50'
        }
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-caption font-semibold">
          {numero}
        </span>
        <span className="text-caption font-semibold leading-tight text-fg sm:text-body">{rotulo}</span>
      </button>
    </li>
  )
}
