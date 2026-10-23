'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SectionCard, StatusBadge } from '@/components/ui/admin-v2'
import { formatarDecimal } from '@/lib/import/hub/decimais'
import type { Cambio, Despesa, Item, Tributo } from '@/lib/import/hub/dadosImportacoes'
import { composicaoValorAduaneiro, conciliarEncargosAduaneiros, sugerirTributos } from '@/lib/import/hub/inteligencia'
import { opcoesNacionais, parametrosDaEmpresa, type DadosCatalogoEmpresa } from '@/lib/import/hub/catalogoEmpresa'
import { aliquotaDaUf } from '@shared-core/src/import'
import { divide, formataDecimal, parseDecimal } from '@shared-core/src/import/decimal'
import { ROUTES } from '@/lib/navigation/routes'
import { registrarTributosSugeridosAction } from '../actions-inteligencia'
import { preencherValoresAduaneirosAction } from '../actions-valor-aduaneiro'
import { ErroFormulario, Texto, useAcao, type TextosImport } from './campos'

/** Micro-reais (escala 6) → centavos HALF_UP, só para exibição. */
const c2 = (v: string) => formataDecimal(divide(parseDecimal(v, 6), 6, 1n, 0, 2), 2)

/**
 * Inteligência tributária por NCM: SUGESTÃO determinística a partir de parâmetros versionados.
 * Registrar = criar tributos PENDENTES de conferência (revisão humana obrigatória).
 */
export function TributosSecao(props: {
  t: TextosImport
  operacaoId: string
  itens: Item[]
  cambios: Cambio[]
  tributos: Tributo[]
  despesas?: Despesa[]
  dataPadrao: string
  editavel: boolean
  /** Configuração nacional da empresa (null ⇒ catálogo de demonstração, como antes). */
  catalogo?: DadosCatalogoEmpresa | null
}) {
  const { t } = props
  const { executar, pendente, erro } = useAcao(t)
  const [uf, setUf] = useState(props.catalogo?.config?.uf_importador ?? 'SP')
  const [data, setData] = useState(props.dataPadrao)
  const tk = (k: string) => (t as Record<string, string>)[k] ?? k
  const r = useMemo(() => {
    try {
      return /^[A-Z]{2}$/.test(uf) && /^\d{4}-\d{2}-\d{2}$/.test(data) ? (() => { const c = parametrosDaEmpresa(props.catalogo ?? null, uf); return sugerirTributos(props.itens, props.cambios, uf, data, c.parametros, c.versao, opcoesNacionais(props.catalogo ?? null, props.despesas ?? [])) })() : null
    } catch {
      return null
    }
  }, [props.itens, props.cambios, props.catalogo, props.despesas, uf, data])
  // Textos novos (CALC-001.1): chave i18n com fallback pt até as chaves entrarem em pt.json/zh.json.
  const tx = (k: string, pt: string) => (t as Record<string, string>)[k] ?? pt
  const va = useMemo(() => {
    try { return composicaoValorAduaneiro(props.itens, props.cambios, props.despesas ?? []) } catch { return null }
  }, [props.itens, props.cambios, props.despesas])
  const conc = useMemo(() => {
    const o = opcoesNacionais(props.catalogo ?? null, props.despesas ?? [])
    try { return o ? conciliarEncargosAduaneiros(o.despesas, props.cambios, o.maritimo) : null } catch { return null }
  }, [props.catalogo, props.despesas, props.cambios])
  const vaPendente = !va || va.semBase.length > 0 || va.pendencias.length > 0
  const nSemVa = va?.semValorInformado.length ?? 0
  const jaRegistrado = (itemId: string, trib: string) => props.tributos.some((x) => x.item_id === itemId && x.tributo_codigo === trib)
  const calculaveis = r?.sugestoes.filter((s) => s.status === 'CALCULADO' && !jaRegistrado(s.item_id, s.tributo)) ?? []
  const [marcados, setMarcados] = useState<Set<string> | null>(null)
  // Valor zero (ex.: CBS/IBS 2026, não cobrados) não vem pré-selecionado para registro.
  const sel = marcados ?? new Set(calculaveis.filter((s) => s.valor_brl !== '0.00').map((s) => `${s.item_id}:${s.tributo}`))
  const nomeItem = (id: string) => props.itens.find((i) => i.id === id)?.descricao ?? '—'
  const nacional = Boolean(props.catalogo?.config)
  const ufInfo = nacional ? aliquotaDaUf(uf, props.catalogo?.tabela?.length ? props.catalogo.tabela : undefined) : null
  const tom = (st: string) => (st === 'CALCULADO' ? 'success' : st === 'PENDENTE_ALIQUOTA' ? 'warning' : 'neutral') as 'success' | 'warning' | 'neutral'

  return (
    <SectionCard title={t.trib_ncm_titulo} subtitle={t.trib_ncm_subtitulo}>
      {nacional ? (
        <div role="note" className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-warning-strong)] bg-[var(--color-surface-soft)] px-3 py-2 text-small" data-testid="imp-trib-nacional">
          <strong>{t.nac_aviso}</strong>
          {ufInfo ? (
            <span title={t.nac_badge_dica} data-testid="imp-trib-badge-uf">
              <StatusBadge tone={ufInfo.status === 'VERIFICADO' ? 'success' : 'warning'}>{uf} · {tk(`nac_badge_${ufInfo.status}`)}</StatusBadge>
            </span>
          ) : null}
          <span>{t.nac_sem_ii}</span>
          <Link className="font-medium text-[var(--color-brand-primary)] underline" href={`${ROUTES.admin.importacoes}/configuracao`}>{t.nac_configurar}</Link>
        </div>
      ) : (
        <>
          <p role="note" className="mb-3 rounded-md border border-[var(--color-warning-strong)] bg-[var(--color-surface-soft)] px-3 py-2 text-small" data-testid="imp-trib-ficticio">
            {t.trib_ncm_aviso_ficticio}
          </p>
          {props.catalogo !== undefined ? (
            <p className="mb-3 text-small" data-testid="imp-trib-onboarding">
              {t.nac_catalogo_demo}{' '}
              <Link className="font-medium text-[var(--color-brand-primary)] underline" href={`${ROUTES.admin.importacoes}/configuracao`}>{t.nac_configurar}</Link>
            </p>
          ) : null}
        </>
      )}
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Texto rotulo={t.trib_ncm_uf} valor={uf} onChange={(x) => setUf(x.toUpperCase().slice(0, 2))} maxLength={2} testId="imp-trib-uf" />
        <Texto rotulo={t.trib_fato_gerador} valor={data} onChange={setData} tipo="date" testId="imp-trib-data" />
      </div>
      {props.itens.length === 0 ? <p className="text-small text-fg-subtle">{t.trib_ncm_sem_itens}</p> : null}
      {r && r.semBase.length > 0 ? (
        <p role="status" className="mb-2 text-small text-[var(--color-warning-strong)]">{t.trib_ncm_sem_cambio}: {r.semBase.map((x) => nomeItem(x.item_id)).join(', ')}</p>
      ) : null}
      {r && r.sugestoes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-small" data-testid="imp-trib-sugestoes">
            <caption className="sr-only">{t.trib_ncm_titulo}</caption>
            <thead>
              <tr className="text-left text-[11px] uppercase text-fg-subtle">
                <th scope="col" className="px-2 py-1"><span className="sr-only">{t.trib_ncm_selecionar}</span></th>
                <th scope="col" className="px-2 py-1">{t.apu_item}</th>
                <th scope="col" className="px-2 py-1">{t.trib_codigo}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.trib_ncm_base}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.trib_ncm_aliquota}</th>
                <th scope="col" className="px-2 py-1 text-right">{t.trib_valor}</th>
                <th scope="col" className="px-2 py-1">{t.trib_ncm_situacao}</th>
                <th scope="col" className="px-2 py-1">{t.trib_ncm_memoria}</th>
              </tr>
            </thead>
            <tbody>
              {r.sugestoes.map((s) => {
                const k = `${s.item_id}:${s.tributo}`
                const reg = jaRegistrado(s.item_id, s.tributo)
                return (
                  <tr key={k} className="border-t border-[var(--color-border)]">
                    <td className="px-2 py-1.5">
                      {s.status === 'CALCULADO' && !reg && props.editavel ? (
                        <input type="checkbox" aria-label={`${nomeItem(s.item_id)} ${s.tributo}`} checked={sel.has(k)}
                          onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(k); else n.delete(k); setMarcados(n) }} />
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5">{nomeItem(s.item_id)}</td>
                    <td className="px-2 py-1.5 font-mono">{s.tributo}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(s.base_brl)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.aliquota_pct ? `${formatarDecimal(s.aliquota_pct)}%` : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatarDecimal(s.valor_brl)}</td>
                    <td className="px-2 py-1.5">
                      <StatusBadge tone={reg ? 'neutral' : tom(s.status)}>{reg ? t.trib_ncm_ja_registrado : tk(`sug_${s.status}`)}</StatusBadge>
                    </td>
                    <td className="px-2 py-1.5 text-xs">{s.memoria}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {va && va.itens.length > 0 ? (
        <div className="mb-4" data-testid="imp-va-memoria">
          <h3 className="mb-1 text-small font-semibold">{tx('va_titulo', 'Memória do valor aduaneiro (VA) por item')}</h3>
          <p role="note" className="mb-2 rounded-md border border-[var(--color-warning-strong)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs" data-testid="imp-va-criterio">
            {tx('va_criterio', 'Critério fiscal de rateio de frete e seguro: valor FOB — pendente de validação (despachante/contador).')}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <caption className="sr-only">{tx('va_titulo', 'Memória do valor aduaneiro (VA) por item')}</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase text-fg-subtle">
                  <th scope="col" className="px-2 py-1">{t.apu_item}</th>
                  <th scope="col" className="px-2 py-1 text-right">{tx('va_fob', 'FOB (R$)')}</th>
                  <th scope="col" className="px-2 py-1 text-right">{tx('va_frete', 'Frete (R$)')}</th>
                  <th scope="col" className="px-2 py-1 text-right">{tx('va_seguro', 'Seguro (R$)')}</th>
                  <th scope="col" className="px-2 py-1">{tx('va_criterio_col', 'Critério')}</th>
                  <th scope="col" className="px-2 py-1 text-right">{tx('va_calculado', 'VA calculado (R$)')}</th>
                  <th scope="col" className="px-2 py-1 text-right">{tx('va_informado', 'VA informado (R$)')}</th>
                </tr>
              </thead>
              <tbody>
                {va.itens.map((x) => (
                  <tr key={x.item_id} className="border-t border-[var(--color-border)]">
                    <td className="px-2 py-1.5">{nomeItem(x.item_id)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(c2(x.fob_brl))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(c2(x.frete_brl))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(c2(x.seguro_brl))}</td>
                    <td className="px-2 py-1.5 text-xs">{tx(`va_criterio_${x.criterio_frete}`, 'Valor FOB')}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{formatarDecimal(x.valor_aduaneiro_brl_2)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{x.informado_brl ? formatarDecimal(x.informado_brl) : '—'}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--color-border)] font-semibold">
                  <td className="px-2 py-1.5">{tx('va_total', 'Total')}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(c2(va.totais.fob_brl))}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(c2(va.totais.frete_brl))}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(c2(va.totais.seguro_brl))}</td>
                  <td />
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(c2(va.totais.valor_aduaneiro_brl))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          {vaPendente ? (
            <p role="status" className="mt-1 text-xs text-[var(--color-warning-strong)]" data-testid="imp-va-pendencias">
              {tx('va_pendencias', 'Composição incompleta (câmbio ou peso ausente): corrija antes de usar o valor aduaneiro calculado.')}
            </p>
          ) : null}
          {props.editavel && nSemVa > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" disabled={pendente || vaPendente} data-testid="imp-va-usar-calculado"
                onClick={() => executar(() => preencherValoresAduaneirosAction(props.operacaoId), undefined, tx('va_preenchidos', 'Valores aduaneiros preenchidos.'))}>
                {pendente ? t.salvando : tx('va_usar_calculado', 'Usar valor aduaneiro calculado nos {n} itens sem valor informado').replace('{n}', String(nSemVa))}
              </Button>
              <span className="text-xs text-fg-subtle">{tx('va_usar_explicacao', 'Grava o VA calculado só nos itens sem valor; valores informados não mudam. Elimina o bloqueio VALOR_ADUANEIRO_AUSENTE na apuração.')}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {conc && conc.ausente_no_custo_brl !== '0.00' ? (
        <p role="note" className="mb-2 rounded-md border border-[var(--color-warning-strong)] bg-[var(--color-surface-soft)] px-3 py-2 text-small" data-testid="imp-enc-ausente">
          {tx('enc_ausente', 'Encargos considerados na base do ICMS e não lançados no custo: R$ {v} — decisão fiscal F-05 pendente; lance como despesa incorporável se aplicável.').replace('{v}', formatarDecimal(conc.ausente_no_custo_brl))}
          {' '}<span className="text-xs text-fg-subtle">(AFRMM {formatarDecimal(conc.afrmm_icms)} · Siscomex {formatarDecimal(conc.siscomex_icms)})</span>
        </p>
      ) : null}
      {conc?.duplicado ? (
        <p role="alert" className="mb-2 rounded-md border border-[var(--color-warning-strong)] bg-[var(--color-surface-soft)] px-3 py-2 text-small" data-testid="imp-enc-duplicado">
          {tx('enc_duplicado', 'Há mais de um lançamento de AFRMM ou de Siscomex nesta operação — verifique se há duplicidade.')}
        </p>
      ) : null}
      <ErroFormulario mensagem={erro} />
      {props.editavel && calculaveis.length > 0 ? (
        <div className="mt-3 flex items-center gap-2">
          <Button type="button" disabled={pendente || sel.size === 0} data-testid="imp-trib-registrar"
            onClick={() => executar(() => registrarTributosSugeridosAction(props.operacaoId, { uf, data, chaves: [...sel] }), () => setMarcados(null), t.trib_ncm_registrados)}>
            {pendente ? t.salvando : `${t.trib_ncm_registrar} (${sel.size})`}
          </Button>
          <span className="text-xs text-fg-subtle">{t.trib_ncm_revisao}</span>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-fg-subtle">{t.trib_ncm_catalogo}: {r?.catalogo_versao ?? '—'} · {t.trib_ncm_reforma}</p>
    </SectionCard>
  )
}
