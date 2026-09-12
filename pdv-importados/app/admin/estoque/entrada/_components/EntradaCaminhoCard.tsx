import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type CaminhoEntrada = Readonly<{
  id: string
  icone: LucideIcon
  titulo: string
  descricao: string
  cta: string
  href: string
  /** Módulos que este caminho afeta, já traduzidos. */
  efeitos: readonly string[]
  /** Quantas entradas deste tipo estão em andamento (0 esconde o contador). */
  emAndamento: number
}>

type Props = Readonly<{
  caminho: CaminhoEntrada
  efeitoLabel: string
  emAndamentoLabel: string
}>

/** Um dos caminhos de entrada de mercadoria — cartão de escolha do hub. */
export function EntradaCaminhoCard({ caminho, efeitoLabel, emAndamentoLabel }: Props) {
  const { icone: Icone, titulo, descricao, cta, href, efeitos, emAndamento } = caminho

  return (
    <div className="admin-v2-section-card flex flex-col gap-3 rounded-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-info-bg)] text-brand">
          <Icone className="h-5 w-5" aria-hidden />
        </span>
        {emAndamento > 0 ? (
          <span className="rounded-full bg-[var(--color-warning-bg)] px-2 py-0.5 text-caption font-medium text-[var(--color-warning-strong)]">
            {emAndamento} {emAndamentoLabel}
          </span>
        ) : null}
      </div>

      <div className="flex-1">
        <h3 className="text-body font-semibold text-fg">{titulo}</h3>
        <p className="mt-1 text-caption leading-relaxed text-fg-muted">{descricao}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-fg-subtle">{efeitoLabel}:</span>
        {efeitos.map((efeito) => (
          <span
            key={efeito}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-0.5 text-caption text-fg-muted"
          >
            {efeito}
          </span>
        ))}
      </div>

      <Button asChild variant="secondary" size="sm" className="w-full justify-center gap-1.5">
        <Link href={href}>
          {cta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </Button>
    </div>
  )
}
