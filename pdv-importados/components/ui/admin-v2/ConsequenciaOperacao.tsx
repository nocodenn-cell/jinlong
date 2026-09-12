import type { ReactNode } from 'react'
import { AlertTriangle, Coins, FileText, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Aviso de consequência operacional — padrão de UX do Bling trazido para o Jinlong.
 *
 * O Bling informa, no próprio formulário e ANTES de salvar, em qual módulo o
 * reflexo da operação vai aparecer ("as contas são lançadas automaticamente em
 * Contas a pagar..."). Sem isso, todo fluxo transversal (entrada → estoque →
 * financeiro) exige que o operador confie e confira depois.
 *
 * Usado em: conferência de NF-e, recebimento de ordem de compra.
 */

export type EfeitoTom = 'estoque' | 'financeiro' | 'documento' | 'alerta'

export type EfeitoOperacao = Readonly<{
  /** Domínio afetado — define o ícone e o tom, nunca o texto. */
  tom: EfeitoTom
  /** Frase única, em linguagem de operador, do que vai acontecer. */
  texto: string
}>

const TOM_ICONE = {
  estoque: Package,
  financeiro: Coins,
  documento: FileText,
  alerta: AlertTriangle,
} as const

const TOM_CLASSES: Readonly<Record<EfeitoTom, string>> = {
  estoque: 'bg-[var(--color-info-bg)] text-brand',
  financeiro: 'bg-[var(--color-success-bg)] text-[var(--color-success-strong)]',
  documento: 'bg-[var(--color-surface-muted)] text-fg-muted',
  alerta: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]',
}

type Props = Readonly<{
  titulo: string
  efeitos: readonly EfeitoOperacao[]
  /** Ações de próximo passo — renderizadas abaixo da lista. */
  acoes?: ReactNode
  className?: string
}>

export function ConsequenciaOperacao({ titulo, efeitos, acoes, className }: Props) {
  if (efeitos.length === 0) return null

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3',
        className,
      )}
    >
      <p className="text-caption font-semibold uppercase tracking-wide text-fg-muted">{titulo}</p>
      <ul className="mt-2 space-y-1.5">
        {efeitos.map((efeito) => {
          const Icone = TOM_ICONE[efeito.tom]
          return (
            <li key={efeito.texto} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                  TOM_CLASSES[efeito.tom],
                )}
              >
                <Icone className="h-3 w-3" />
              </span>
              <span className="text-body text-fg">{efeito.texto}</span>
            </li>
          )
        })}
      </ul>
      {acoes ? <div className="mt-3 flex flex-wrap gap-2">{acoes}</div> : null}
    </div>
  )
}
