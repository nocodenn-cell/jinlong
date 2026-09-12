import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { SectionCard } from '@/components/ui/admin-v2'
import { EmptyState } from '@/components/ui/feedback'

export type PendenciaEntrada = Readonly<{
  id: string
  label: string
  total: number
  href: string
}>

type Props = Readonly<{
  titulo: string
  subtitulo: string
  vazio: string
  retomarLabel: string
  pendencias: readonly PendenciaEntrada[]
}>

/**
 * "O que já começou e ainda não creditou estoque" — responde, na própria tela
 * de partida, a pergunta que no Bling só se descobre entrando módulo a módulo.
 */
export function EntradaPendencias({
  titulo,
  subtitulo,
  vazio,
  retomarLabel,
  pendencias,
}: Props) {
  const abertas = pendencias.filter((p) => p.total > 0)

  return (
    <SectionCard title={titulo} subtitle={subtitulo}>
      {abertas.length === 0 ? (
        <EmptyState title={vazio} />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {abertas.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex items-baseline gap-2.5">
                <span className="text-title font-semibold tabular-nums text-fg">{p.total}</span>
                <span className="text-body text-fg-muted">{p.label}</span>
              </span>
              <Link
                href={p.href}
                className="inline-flex items-center gap-1 text-caption font-medium text-brand hover:underline"
              >
                {retomarLabel}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
