import Link from 'next/link'
import { SectionCard, StatusBadge } from '@/components/ui/admin-v2'
import { adminImportacaoHref } from '@/lib/navigation/routes'
import { diferencaDecimal, formatarDecimal } from '@/lib/import/hub/decimais'
import { motivosInelegibilidade } from '@/lib/import/hub/elegibilidade'
import type { ApuracaoDetalhe, ApuracaoResumo, Aprovacao, Auditoria, Item, Operacao } from '@/lib/import/hub/dadosImportacoes'
import type { TextosImport } from './campos'
import { AprovarForm, EstadoForm } from './DecisaoForms'

export function VersoesSecao(props: {
  t: TextosImport
  operacao: Operacao
  apuracoes: ApuracaoResumo[]
  selecionada: ApuracaoDetalhe | null
  comparada: ApuracaoDetalhe | null
  itens: Item[]
  lancamentos: { status_conferencia: string }[]
  aprovacoes: Aprovacao[]
  auditoria: Auditoria[]
  usuarios: Record<string, string>
  ehDono: boolean
}) {
  const { t, operacao: o, selecionada: sel } = props
  const tk = (k: string) => (t as Record<string, string>)[k] ?? k
  const quem = (id: string | null) => (id ? props.usuarios[id] ?? id.slice(0, 8) : '—')
  const nomeItem = (id: string) => props.itens.find((i) => i.id === id)?.descricao ?? id.slice(0, 8)
  const motivos = sel
    ? motivosInelegibilidade({
        tipo: sel.tipo,
        statusCalculo: sel.status_calculo,
        conservacaoOk: sel.conservacao_ok,
        engineVersion: sel.engine_version,
        versaoDadosApuracao: sel.versao_dados,
        versaoDadosOperacao: o.versao_dados,
        divergencias: sel.saida.divergencias,
        lancamentos: props.lancamentos,
      })
    : []

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title={t.ver_titulo}>
        {props.apuracoes.length === 0 ? (
          <p className="text-small text-fg-subtle">{t.apu_nenhuma}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-small" data-testid="imp-versoes">
              <caption className="sr-only">{t.ver_titulo}</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase text-fg-subtle">
                  <th scope="col" className="px-2 py-1">{t.apu_versao}</th>
                  <th scope="col" className="px-2 py-1">{t.col_status}</th>
                  <th scope="col" className="px-2 py-1">{t.ver_criado_por}</th>
                  <th scope="col" className="px-2 py-1">{t.ver_em}</th>
                  <th scope="col" className="px-2 py-1"><span className="sr-only">{t.abrir}</span></th>
                </tr>
              </thead>
              <tbody>
                {props.apuracoes.map((a) => (
                  <tr key={a.id} className="border-t border-[var(--color-border)]/60" aria-current={sel?.id === a.id ? 'true' : undefined}>
                    <td className="px-2 py-1.5 font-semibold">v{a.versao}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge tone="neutral">{tk(`apu_tipo_${a.tipo}`)}</StatusBadge>
                        <StatusBadge tone={a.status_calculo === 'OK' ? 'success' : 'danger'}>{tk(`apu_status_${a.status_calculo}`)}</StatusBadge>
                        {o.apuracao_aprovada_id === a.id ? <StatusBadge tone="success">{t.ver_aprovada}</StatusBadge> : null}
                        {a.versao_dados === o.versao_dados ? <StatusBadge tone="neutral">{t.ver_atual}</StatusBadge> : null}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">{quem(a.criado_por)}</td>
                    <td className="px-2 py-1.5 tabular-nums">{new Date(a.criado_em).toLocaleString()}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <Link className="underline-offset-4 hover:underline" href={adminImportacaoHref(o.id, { aba: 'apuracao', apuracao: a.id })}>
                        {t.abrir}
                      </Link>
                      {sel && sel.id !== a.id ? (
                        <Link
                          className="ml-3 underline-offset-4 hover:underline"
                          href={adminImportacaoHref(o.id, { aba: 'versoes', apuracao: sel.id, comparar: a.id })}
                          data-testid="imp-comparar"
                        >
                          {t.ver_comparar} v{sel.versao} × v{a.versao}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {sel && props.comparada ? (
        <SectionCard title={`${t.ver_comparacao}: v${props.comparada.versao} → v${sel.versao}`}>
          <table className="w-full text-small" data-testid="imp-comparacao">
            <caption className="sr-only">{t.ver_comparacao}</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase text-fg-subtle">
                <th scope="col" className="px-2 py-1">{t.apu_item}</th>
                <th scope="col" className="px-2 py-1 text-right">v{props.comparada.versao} · {t.apu_custo_unit}</th>
                <th scope="col" className="px-2 py-1 text-right">v{sel.versao} · {t.apu_custo_unit}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.ver_diferenca}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.ver_diferenca} · {t.apu_custo_total_item}</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set([...sel.saida.itens, ...props.comparada.saida.itens].map((i) => i.item_id))].map((id) => {
                const a = props.comparada!.saida.itens.find((i) => i.item_id === id)
                const b = sel.saida.itens.find((i) => i.item_id === id)
                return (
                  <tr key={id} className="border-t border-[var(--color-border)]/60">
                    <td className="px-2 py-1.5">{nomeItem(id)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(a?.custo_unitario_brl)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(b?.custo_unitario_brl)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(diferencaDecimal(a?.custo_unitario_brl, b?.custo_unitario_brl, 6))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(diferencaDecimal(a?.custo_total_brl, b?.custo_total_brl, 4))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </SectionCard>
      ) : null}

      <SectionCard title={t.aprov_titulo}>
        {o.status === 'APROVADA' ? (
          <p className="mb-3 text-body" data-testid="imp-aprovada">
            <StatusBadge tone="success">{t.aprov_aprovada_em}</StatusBadge>{' '}
            v{props.apuracoes.find((a) => a.id === o.apuracao_aprovada_id)?.versao ?? '?'}
          </p>
        ) : null}
        {!props.ehDono ? <p className="mb-3 text-small text-fg-subtle">{t.aprov_somente_dono}</p> : null}

        {o.status === 'RASCUNHO' && sel ? (
          motivos.length > 0 ? (
            <div role="status" className="mb-3 text-small" data-testid="imp-inelegivel">
              <p className="font-semibold">{t.aprov_inelegivel} v{sel.versao}</p>
              <ul className="list-disc pl-5">
                {motivos.map((m) => <li key={m}>{tk(`motivo_${m}`)}</li>)}
              </ul>
            </div>
          ) : props.ehDono ? (
            <AprovarForm t={t} operacaoId={o.id} apuracaoId={sel.id} />
          ) : null
        ) : null}

        {props.ehDono && o.status === 'APROVADA' ? <EstadoForm t={t} operacaoId={o.id} acao="REABRIR" /> : null}
        {o.status === 'RASCUNHO' ? <div className="mt-4"><EstadoForm t={t} operacaoId={o.id} acao="CANCELAR" /></div> : null}

        {props.aprovacoes.length > 0 ? (
          <div className="mt-4">
            <h3 className="mb-1 text-small font-semibold">{t.aprov_historico}</h3>
            <ul className="text-small" data-testid="imp-decisoes">
              {props.aprovacoes.map((a) => (
                <li key={a.id} className="border-t border-[var(--color-border)]/60 py-1.5">
                  <StatusBadge tone={a.decisao === 'APROVADA' ? 'success' : 'neutral'}>{tk(`dec_${a.decisao}`)}</StatusBadge>{' '}
                  {quem(a.por)} · {new Date(a.em).toLocaleString()} — {a.motivo}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={t.auditoria_titulo}>
        {props.auditoria.length === 0 ? (
          <p className="text-small text-fg-subtle">{t.auditoria_vazio}</p>
        ) : (
          <ul className="text-small" data-testid="imp-auditoria">
            {props.auditoria.map((a) => (
              <li key={a.id} className="flex gap-3 border-t border-[var(--color-border)]/60 py-1">
                <span className="tabular-nums text-fg-subtle">{new Date(a.em).toLocaleString()}</span>
                <span>{quem(a.por)}</span>
                <code className="text-xs">{a.acao} · {a.entidade}</code>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
