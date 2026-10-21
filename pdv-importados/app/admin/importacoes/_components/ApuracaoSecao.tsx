import { SectionCard, StatusBadge } from '@/components/ui/admin-v2'
import { formatarDecimal, somarExato } from '@/lib/import/hub/decimais'
import type { ApuracaoDetalhe, Item } from '@/lib/import/hub/dadosImportacoes'
import type { TextosImport } from './campos'
import { ApurarBotoes } from './ApurarBotoes'

/**
 * Apuração exibida a partir da SAÍDA GUARDADA do motor (strings exatas). Nenhum número é
 * recalculado para exibição além de somas exatas (bigint); nada é arredondado visualmente.
 */
export function ApuracaoSecao(props: {
  t: TextosImport
  operacaoId: string
  apuracao: ApuracaoDetalhe | null
  itens: Item[]
  versaoDadosOperacao: number
  usuarios: Record<string, string>
  podeCalcular: boolean
}) {
  const { t, apuracao: a } = props
  const tk = (k: string) => (t as Record<string, string>)[k] ?? k
  const nomeItem = (id: string) => props.itens.find((i) => i.id === id)?.descricao ?? id.slice(0, 8)

  const cabecalho = (
    <SectionCard title={t.apu_titulo} subtitle={t.apu_hint} action={props.podeCalcular ? <ApurarBotoes t={t} operacaoId={props.operacaoId} /> : null}>
      {!a ? (
        <p className="text-body text-fg-subtle" data-testid="imp-apuracao-vazia">{t.apu_nenhuma}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-small" data-testid="imp-apuracao-cabecalho">
          <span className="font-semibold">{t.apu_versao} {a.versao}</span>
          <StatusBadge tone="neutral">{tk(`apu_tipo_${a.tipo}`)}</StatusBadge>
          <StatusBadge tone={a.status_calculo === 'OK' ? 'success' : 'danger'}>{tk(`apu_status_${a.status_calculo}`)}</StatusBadge>
          <span className="text-fg-subtle">
            {props.usuarios[a.criado_por] ?? '—'} · {new Date(a.criado_em).toLocaleString()} · {t.apu_motor} {a.engine_version}
          </span>
          {a.versao_dados !== props.versaoDadosOperacao ? (
            <p role="alert" className="w-full rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-[var(--color-warning-strong)]">
              {t.apu_desatualizada}
            </p>
          ) : null}
        </div>
      )}
    </SectionCard>
  )
  if (!a) return cabecalho

  const s = a.saida
  const soma = (k: 'mercadoria' | 'despesas_incorporadas' | 'tributos_nao_recuperaveis' | 'descontos') =>
    somarExato(s.itens.map((i) => i.componentes_brl[k]))
  const total = somarExato(s.itens.map((i) => i.custo_total_brl))
  const bloqueantes = s.divergencias.filter((d) => d.severidade === 'BLOQUEANTE')

  const resumo: [string, string | null][] = [
    [t.apu_mercadoria, soma('mercadoria')],
    [t.apu_despesas, soma('despesas_incorporadas')],
    [t.apu_tributos, soma('tributos_nao_recuperaveis')],
    [t.apu_descontos, soma('descontos')],
    [t.apu_creditos_rec, s.creditos.reconhecido_brl],
    [t.apu_creditos_pot, s.creditos.potencial_brl],
  ]

  return (
    <div className="flex flex-col gap-5">
      {cabecalho}

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard title={t.apu_total}>
          <p className="text-h2 font-bold tabular-nums" data-testid="imp-custo-total">R$ {formatarDecimal(total)}</p>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-small">
            {resumo.map(([rot, val]) => (
              <div key={rot} className="contents">
                <dt className="text-fg-subtle">{rot}</dt>
                <dd className="text-right tabular-nums">{formatarDecimal(val)}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title={t.apu_conservacao}>
          <p className={s.conservacao.ok ? 'text-[var(--color-success-strong)]' : 'font-semibold text-[var(--color-danger-strong)]'} data-testid="imp-conservacao">
            {s.conservacao.ok ? t.apu_conservacao_ok : t.apu_conservacao_falha}
          </p>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-small">
            <dt className="text-fg-subtle">{t.apu_entradas}</dt><dd className="text-right tabular-nums">{formatarDecimal(s.conservacao.entradas_brl)}</dd>
            <dt className="text-fg-subtle">{t.apu_descontos}</dt><dd className="text-right tabular-nums">{formatarDecimal(s.conservacao.descontos_brl)}</dd>
            <dt className="text-fg-subtle">{t.apu_saidas}</dt><dd className="text-right tabular-nums">{formatarDecimal(s.conservacao.saidas_brl)}</dd>
            <dt className="text-fg-subtle">{t.apu_diferenca}</dt><dd className="text-right tabular-nums">{formatarDecimal(s.conservacao.diferenca_brl)}</dd>
          </dl>
          <p className="mt-3 break-all text-xs text-fg-subtle">{t.apu_hash}: {a.saida_sha256}</p>
        </SectionCard>

        <SectionCard title={t.apu_divergencias}>
          {s.divergencias.length === 0 ? (
            <p className="text-small text-fg-subtle">{t.apu_sem_divergencias}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-small" data-testid="imp-divergencias" aria-label={t.apu_divergencias}>
              {s.divergencias.map((d, i) => (
                <li key={`${d.codigo}-${i}`} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <StatusBadge tone={d.severidade === 'BLOQUEANTE' ? 'danger' : 'warning'}>{tk(`sev_${d.severidade}`)}</StatusBadge>
                    <code className="text-xs">{d.codigo}</code>
                  </span>
                  <span>{d.mensagem}</span>
                  <span className="text-xs text-fg-subtle">{d.referencia}</span>
                </li>
              ))}
            </ul>
          )}
          {bloqueantes.length > 0 ? <p className="sr-only">{t.apu_status_BLOQUEADO}</p> : null}
        </SectionCard>
      </div>

      <SectionCard title={t.apu_item}>
        <div className="overflow-x-auto">
          <table className="w-full text-small" data-testid="imp-apuracao-itens">
            <caption className="sr-only">{t.apu_item}</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase text-fg-subtle">
                <th scope="col" className="px-2 py-1">{t.apu_item}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.apu_qtd_estoque}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.apu_mercadoria}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.apu_despesas}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.apu_tributos}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.apu_descontos}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.apu_custo_total_item}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.apu_custo_unit}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.apu_residuo}</th>
              </tr>
            </thead>
            <tbody>
              {s.itens.map((i) => (
                <tr key={i.item_id} className="border-t border-[var(--color-border)]/60">
                  <td className="px-2 py-1.5 font-medium">{nomeItem(i.item_id)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(i.quantidade_estoque)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(i.componentes_brl.mercadoria)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(i.componentes_brl.despesas_incorporadas)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(i.componentes_brl.tributos_nao_recuperaveis)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(i.componentes_brl.descontos)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatarDecimal(i.custo_total_brl)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums" data-testid="imp-custo-unitario">{formatarDecimal(i.custo_unitario_brl)}</td>
                  <td className="px-2 py-1.5 text-right text-xs tabular-nums text-fg-subtle">{formatarDecimal(i.residuo_total_brl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title={t.apu_memoria} subtitle={t.apu_memoria_hint}>
        <div className="flex flex-col gap-4" data-testid="imp-memoria">
          {s.itens.map((i) => (
            <details key={i.item_id} className="rounded-md border border-[var(--color-border)] p-3" open={s.itens.length <= 3}>
              <summary className="cursor-pointer font-semibold">
                {nomeItem(i.item_id)} — R$ {formatarDecimal(i.custo_unitario_brl)} / un.
              </summary>
              <ol className="mt-2 list-decimal pl-5 text-small leading-relaxed">
                {i.memoria.map((linha, k) => (
                  <li key={k} className="tabular-nums">{linha}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </SectionCard>

      {s.rateios.length > 0 ? (
        <SectionCard title={t.apu_rateios}>
          <div className="overflow-x-auto">
            <table className="w-full text-small" data-testid="imp-rateios">
              <caption className="sr-only">{t.apu_rateios}</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase text-fg-subtle">
                  <th scope="col" className="px-2 py-1">{t.apu_rateio_origem}</th>
                  <th scope="col" className="px-2 py-1">{t.apu_rateio_criterio}</th>
                  <th scope="col" className="px-2 py-1">{t.apu_item}</th>
                  <th scope="col" className="px-2 py-1 text-right">{t.apu_rateio_base}</th>
                  <th scope="col" className="px-2 py-1 text-right">{t.apu_rateio_valor}</th>
                  <th scope="col" className="px-2 py-1">{t.desp_justificativa}</th>
                </tr>
              </thead>
              <tbody>
                {s.rateios.map((r, k) => (
                  <tr key={`${r.origem_id}-${r.item_id}-${k}`} className="border-t border-[var(--color-border)]/60">
                    <td className="px-2 py-1.5">
                      {r.componente === 'despesas' ? t.apu_despesas : r.componente === 'descontos' ? t.apu_descontos : t.apu_tributos}
                    </td>
                    <td className="px-2 py-1.5">{tk(`crit_${r.criterio}`)}</td>
                    <td className="px-2 py-1.5">{nomeItem(r.item_id)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(r.base_item)} / {formatarDecimal(r.base_total)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(r.valor_alocado_brl)}</td>
                    <td className="px-2 py-1.5 text-xs">{r.justificativa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.despesas_nao_incorporadas.length > 0 ? (
            <p className="mt-3 text-small text-fg-subtle">{t.apu_nao_incorporadas}: {s.despesas_nao_incorporadas.length}</p>
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  )
}
