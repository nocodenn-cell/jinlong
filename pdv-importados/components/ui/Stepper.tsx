import { cn } from '@/lib/utils'

export type StepperStep = {
  id: string
  label: string
}

type StepperProps = {
  steps: readonly StepperStep[]
  current: string
  className?: string
}

/**
 * Stepper — progresso de wizard (Sprint 0 / IX-WIZARD).
 */
export function Stepper({ steps, current, className }: StepperProps) {
  const currentIdx = Math.max(
    0,
    steps.findIndex((s) => s.id === current),
  )
  return (
    <ol
      className={cn('flex flex-wrap items-center gap-2', className)}
      aria-label="Progresso"
    >
      {steps.map((step, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        return (
          <li key={step.id} className="flex items-center gap-2">
            {idx > 0 ? (
              <span aria-hidden className="text-fg-subtle">
                /
              </span>
            ) : null}
            <span
              aria-current={active ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-caption font-medium',
                active && 'bg-[var(--color-info-bg)] text-brand',
                done && !active && 'text-fg-muted',
                !done && !active && 'text-fg-subtle',
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border text-[10px]',
                  active
                    ? 'border-brand bg-brand text-white'
                    : 'border-[var(--color-border)]',
                )}
              >
                {idx + 1}
              </span>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
