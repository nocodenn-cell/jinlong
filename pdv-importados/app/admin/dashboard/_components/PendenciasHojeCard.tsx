import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import { SectionCard } from '@/components/ui/admin-v2'
import {
  linhasPendencias,
  pendenciasIndisponiveis,
  type PendenciasHoje,
} from '../pendenciasHoje'
import { formatNumberLocale } from '@/lib/format/money'

type Lk = 'pt' | 'cn'

const T = {
  titulo: { pt: 'Pendências do dia', cn: '今日待办' },
  subtitulo: { pt: 'O que precisa de ação agora.', cn: '现在需要处理的事项。' },
  nada: { pt: 'Nada pendente no financeiro agora.', cn: '财务目前没有待办事项。' },
  indisponivel: { pt: 'Não foi possível verificar as pendências agora.', cn: '暂时无法检查待办事项。' },
  pagarVencidas: { pt: 'Contas a pagar vencidas', cn: '逾期应付账款' },
  receberVencidas: { pt: 'Contas a receber vencidas', cn: '逾期应收账款' },
  pagarVenceHoje: { pt: 'Contas a pagar que vencem hoje', cn: '今日到期应付账款' },
  abrir: { pt: 'Abrir', cn: '打开' },
} as const

/**
 * Card "Pendências do dia" do painel Hoje: cada linha é um atalho já filtrado para resolver a
 * pendência (1 clique em vez de abrir Dinheiro → aba → filtro). Sem pendência, diz isso
 * explicitamente — silêncio não é feedback.
 */
export function PendenciasHojeCard({
  pendencias,
  lk,
  locale,
}: {
  pendencias: PendenciasHoje
  lk: Lk
  locale: string
}) {
  const linhas = linhasPendencias(pendencias)
  const indisponivel = pendenciasIndisponiveis(pendencias)

  return (
    <SectionCard title={T.titulo[lk]} subtitle={T.subtitulo[lk]}>
      <div data-testid="pendencias-hoje">
        {indisponivel ? (
          <p className="text-caption text-fg-subtle">{T.indisponivel[lk]}</p>
        ) : linhas.length === 0 ? (
          <p className="flex items-center gap-2 text-caption text-[var(--color-success-strong)]">
            <CheckCircle2 size={14} aria-hidden />
            {T.nada[lk]}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {linhas.map((l) => (
              <li key={l.id}>
                <Link
                  href={l.href}
                  data-testid={`pendencia-${l.id}`}
                  aria-label={`${T[l.id][lk]}: ${l.quantidade}. ${T.abrir[lk]}`}
                  className="group flex items-center justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <span className="flex min-w-0 items-center gap-2 text-body text-fg">
                    <AlertTriangle
                      size={14}
                      aria-hidden
                      className={
                        l.tom === 'danger'
                          ? 'shrink-0 text-[var(--color-danger-strong)]'
                          : 'shrink-0 text-[var(--color-warning-fg)]'
                      }
                    />
                    <span className="truncate">{T[l.id][lk]}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 tabular-nums font-semibold text-fg">
                    {formatNumberLocale(l.quantidade, locale)}
                    <ChevronRight size={14} aria-hidden className="text-fg-subtle group-hover:text-brand" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}
