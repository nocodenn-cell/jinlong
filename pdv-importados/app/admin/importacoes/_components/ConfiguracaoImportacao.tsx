'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionCard, StatusBadge } from '@/components/ui/admin-v2'
import {
  ALIQUOTAS_UF, FONTES_CATALOGO_UF, parametroIcmsUf, simularRevendaInterestadual, type AliquotaUf,
} from '@shared-core/src/import'
import { formatarDecimal } from '@/lib/import/hub/decimais'
import type { DadosCatalogoEmpresa } from '@/lib/import/hub/catalogoEmpresa'
import { removerOverrideTributoAction, salvarConfigImportacaoAction, salvarOverrideTributoAction } from '../actions-configuracao'
import { Campo, ErroFormulario, Selecao, Texto, useAcao, type TextosImport } from './campos'

const TRIBUTOS = ['II', 'IPI', 'PIS_IMPORTACAO', 'COFINS_IMPORTACAO', 'ICMS'] as const
const PCT_RE = /^\d{1,2}([.,]\d{1,4})?$/

export function ConfiguracaoImportacao(props: { t: TextosImport; catalogo: DadosCatalogoEmpresa | null; podeEditar: boolean }) {
  const { t } = props
  const tk = (k: string) => (t as Record<string, string>)[k] ?? k
  const tabela: readonly AliquotaUf[] = props.catalogo?.tabela?.length ? props.catalogo.tabela : ALIQUOTAS_UF
  const cfg = props.catalogo?.config ?? null
  const { executar, pendente, erro } = useAcao(t)

  const [uf, setUf] = useState(cfg?.uf_importador ?? '')
  const [porto, setPorto] = useState(cfg?.porto_padrao ?? '')
  const [modal, setModal] = useState<string>(cfg?.modal_padrao ?? 'MARITIMO')
  const [efetivo, setEfetivo] = useState(cfg?.icms_efetivo_pct ? formatarDecimal(cfg.icms_efetivo_pct) : '')
  const [regime, setRegime] = useState(cfg?.regime_incentivo_nome ?? '')
  const [regTrib, setRegTrib] = useState<string>(cfg?.regime_tributario ?? 'SIMPLES')
  const [aceite, setAceite] = useState(Boolean(cfg?.aviso_aceito_em))
  const linhaUf = tabela.find((a) => a.uf === uf) ?? null

  const [oTrib, setOTrib] = useState<string>('II')
  const [oNcm, setONcm] = useState('')
  const [oPct, setOPct] = useState('')
  const [oNota, setONota] = useState('')

  const [rDest, setRDest] = useState('SP')
  const [rPreco, setRPreco] = useState('1000')
  const [rConteudo, setRConteudo] = useState('100')
  const [rContrib, setRContrib] = useState('S')
  const rev = useMemo(() => {
    if (!uf || !/^\d+([.,]\d{1,2})?$/.test(rPreco) || !/^\d{1,3}([.,]\d{1,2})?$/.test(rConteudo)) return null
    try {
      return simularRevendaInterestadual({ uf_origem: uf, uf_destino: rDest, preco_venda_brl: rPreco.replace(',', '.'),
        conteudo_importacao_pct: rConteudo.replace(',', '.'), destinatario_contribuinte: rContrib === 'S' }, tabela)
    } catch { return null }
  }, [uf, rDest, rPreco, rConteudo, rContrib, tabela])

  const ufOpcoes = [{ valor: '', rotulo: '—' }, ...tabela.map((a) => ({ valor: a.uf, rotulo: a.uf }))]
  const valido = uf !== '' && aceite && (efetivo === '' || PCT_RE.test(efetivo))

  return (
    <div className="flex flex-col gap-4">
      <p role="note" className="rounded-md border border-[var(--color-warning-strong)] bg-[var(--color-surface-soft)] px-3 py-2 text-small font-semibold" data-testid="cfg-aviso">
        {t.nac_aviso}
      </p>

      <SectionCard title={cfg ? t.cfg_titulo : t.nac_onboarding_titulo} subtitle={t.nac_onboarding_texto}>
        <div className="grid gap-3 md:grid-cols-3">
          <Selecao rotulo={t.cfg_uf} dica={t.cfg_uf_dica} valor={uf} onChange={setUf} opcoes={ufOpcoes} obrigatorio testId="cfg-uf" desabilitado={!props.podeEditar} />
          <Texto rotulo={t.cfg_porto} dica={t.cfg_porto_dica} valor={porto} onChange={setPorto} maxLength={80} testId="cfg-porto" desabilitado={!props.podeEditar} />
          <Selecao rotulo={t.cfg_modal} dica={t.cfg_afrmm} valor={modal} onChange={setModal} testId="cfg-modal" desabilitado={!props.podeEditar}
            opcoes={['MARITIMO', 'AEREO', 'RODOVIARIO'].map((m) => ({ valor: m, rotulo: tk(`modal_${m}`) }))} />
        </div>
        {linhaUf ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-small" data-testid="cfg-padrao-uf">
            {t.cfg_icms_padrao}: <strong className="tabular-nums">{formatarDecimal(parametroIcmsUf(linhaUf).aliquota_pct)}%</strong>
            <span title={t.nac_badge_dica}><StatusBadge tone={linhaUf.status === 'VERIFICADO' ? 'success' : 'warning'}>{tk(`nac_badge_${linhaUf.status}`)}</StatusBadge></span>
            <span className="text-xs text-fg-subtle">{linhaUf.base_legal} · {linhaUf.nota}</span>
          </p>
        ) : null}
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Texto rotulo={t.cfg_icms_efetivo} dica={t.cfg_icms_efetivo_dica} valor={efetivo} onChange={setEfetivo} modoNumerico maxLength={7} testId="cfg-icms-efetivo" desabilitado={!props.podeEditar} />
          <Texto rotulo={t.cfg_regime} valor={regime} onChange={setRegime} maxLength={120} testId="cfg-regime" desabilitado={!props.podeEditar} />
          <Selecao rotulo={tk('cfg_regime_tributario')} dica={tk('cfg_regime_tributario_dica')} valor={regTrib} onChange={setRegTrib} testId="cfg-regime-tributario" desabilitado={!props.podeEditar}
            opcoes={['SIMPLES', 'PRESUMIDO', 'REAL'].map((m) => ({ valor: m, rotulo: tk(`regime_${m}`) }))} />
        </div>
        <label className="mt-3 flex items-start gap-2 text-small">
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} data-testid="cfg-aceite" disabled={!props.podeEditar} />
          <span>{t.cfg_aceite}</span>
        </label>
        <ErroFormulario mensagem={erro} />
        <div className="mt-3">
          <Button type="button" disabled={!props.podeEditar || !valido || pendente} data-testid="cfg-salvar"
            onClick={() => executar(() => salvarConfigImportacaoAction({ uf_importador: uf, porto_padrao: porto || null, modal_padrao: modal,
              icms_efetivo_pct: efetivo || null, regime_incentivo_nome: regime || null, regime_tributario: regTrib, aviso_aceito: true }), undefined, t.cfg_salvo)}>
            {pendente ? t.salvando : t.cfg_salvar}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={t.ovr_titulo} subtitle={t.ovr_subtitulo}>
        {(props.catalogo?.overrides.length ?? 0) === 0 ? <p className="mb-3 text-small text-fg-subtle" data-testid="ovr-vazio">{t.ovr_vazio}</p> : (
          <table className="mb-3 w-full text-small" data-testid="ovr-lista">
            <thead><tr className="text-left text-[11px] uppercase text-fg-subtle">
              <th className="px-2 py-1">{t.ovr_tributo}</th><th className="px-2 py-1">{t.ovr_ncm}</th>
              <th className="px-2 py-1 text-right">{t.ovr_aliquota}</th><th className="px-2 py-1">{t.ovr_nota}</th><th />
            </tr></thead>
            <tbody>
              {props.catalogo!.overrides.map((o) => (
                <tr key={o.id} className="border-t border-[var(--color-border)]">
                  <td className="px-2 py-1.5 font-mono">{o.tributo}</td>
                  <td className="px-2 py-1.5 font-mono">{o.ncm_prefixo || '*'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(o.aliquota_pct)}%</td>
                  <td className="px-2 py-1.5">{o.nota ?? ''}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button type="button" variant="outline" disabled={pendente || !cfg}
                      onClick={() => executar(() => removerOverrideTributoAction(o.id), undefined, t.ovr_removido)}>{t.ovr_remover}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="grid gap-3 md:grid-cols-5">
          <Selecao rotulo={t.ovr_tributo} valor={oTrib} onChange={setOTrib} opcoes={TRIBUTOS.map((x) => ({ valor: x, rotulo: x }))} testId="ovr-tributo" />
          <Texto rotulo={t.ovr_ncm} valor={oNcm} onChange={(v) => setONcm(v.replace(/\D/g, '').slice(0, 8))} maxLength={8} testId="ovr-ncm" />
          <Texto rotulo={t.ovr_aliquota} valor={oPct} onChange={setOPct} modoNumerico maxLength={7} testId="ovr-aliquota" />
          <Texto rotulo={t.ovr_nota} valor={oNota} onChange={setONota} maxLength={200} testId="ovr-nota" className="md:col-span-2" />
        </div>
        <div className="mt-3">
          <Button type="button" variant="outline" disabled={!cfg || pendente || !PCT_RE.test(oPct)} data-testid="ovr-adicionar"
            onClick={() => executar(() => salvarOverrideTributoAction({ tributo: oTrib, ncm_prefixo: oNcm, aliquota_pct: oPct, nota: oNota || null }),
              () => { setOPct(''); setONota('') }, t.ovr_salvo)}>
            {t.ovr_adicionar}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={t.rev_titulo} subtitle={t.rev_subtitulo}>
        <div className="grid gap-3 md:grid-cols-4">
          <Selecao rotulo={t.rev_destino} valor={rDest} onChange={setRDest} opcoes={tabela.map((a) => ({ valor: a.uf, rotulo: a.uf }))} testId="rev-destino" />
          <Texto rotulo={t.rev_preco} valor={rPreco} onChange={setRPreco} modoNumerico testId="rev-preco" />
          <Texto rotulo={t.rev_conteudo} valor={rConteudo} onChange={setRConteudo} modoNumerico testId="rev-conteudo" />
          <Selecao rotulo={t.rev_contribuinte} valor={rContrib} onChange={setRContrib} testId="rev-contribuinte"
            opcoes={[{ valor: 'S', rotulo: t.rev_sim }, { valor: 'N', rotulo: t.rev_nao }]} />
        </div>
        {rev ? (
          <div className="mt-3 text-small" data-testid="rev-resultado">
            <p><strong>{tk(`rev_regra_${rev.regra}`)}</strong></p>
            <p>{t.rev_aliquota}: <span className="tabular-nums" data-testid="rev-aliquota">{formatarDecimal(rev.aliquota_pct)}%</span> · {t.rev_icms}: <span className="tabular-nums" data-testid="rev-icms">R$ {formatarDecimal(rev.icms_destacado_brl)}</span>
              {rev.aliquota_interna_destino_pct ? <> · {t.rev_interna_destino}: {formatarDecimal(rev.aliquota_interna_destino_pct)}%</> : null}
              {rev.difal_estimado_brl ? <> · {t.rev_difal}: <span className="tabular-nums" data-testid="rev-difal">R$ {formatarDecimal(rev.difal_estimado_brl)}</span></> : null}</p>
            <ul className="mt-2 list-disc pl-5" data-testid="rev-avisos">
              {rev.avisos.map((a) => <li key={a}>{tk(`rev_aviso_${a}`)}</li>)}
            </ul>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={t.tab_titulo}>
        <div className="overflow-x-auto">
          <table className="w-full text-small" data-testid="tab-ufs">
            <thead><tr className="text-left text-[11px] uppercase text-fg-subtle">
              <th className="px-2 py-1">{t.tab_uf}</th><th className="px-2 py-1 text-right">{t.tab_modal}</th><th className="px-2 py-1 text-right">{t.tab_fcp}</th>
              <th className="px-2 py-1">{t.tab_vigencia}</th><th className="px-2 py-1">{t.tab_status}</th><th className="px-2 py-1">{t.tab_base}</th>
            </tr></thead>
            <tbody>
              {tabela.map((a) => (
                <tr key={a.uf} className={`border-t border-[var(--color-border)]${a.uf === uf ? ' bg-[var(--color-surface-soft)] font-semibold' : ''}`}>
                  <td className="px-2 py-1.5 font-mono">{a.uf}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(a.icms_modal_pct)}%</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{a.fcp_geral_pct === '0.0000' ? '—' : `${formatarDecimal(a.fcp_geral_pct)}%`}</td>
                  <td className="px-2 py-1.5 tabular-nums">{a.vigencia_inicio.split('-').reverse().join('/')}</td>
                  <td className="px-2 py-1.5"><StatusBadge tone={a.status === 'VERIFICADO' ? 'success' : 'warning'}>{tk(`nac_badge_${a.status}`)}</StatusBadge></td>
                  <td className="px-2 py-1.5 text-xs">{a.base_legal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Campo rotulo={t.tab_fontes}>{() => (
          <ul className="text-xs">{FONTES_CATALOGO_UF.map((f) => <li key={f}><a className="underline" href={f} target="_blank" rel="noreferrer">{f}</a></li>)}</ul>
        )}</Campo>
      </SectionCard>
    </div>
  )
}
