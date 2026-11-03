'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { SectionCard, StatusBadge } from '@/components/ui/admin-v2'
import { formatarDecimal } from '@/lib/import/hub/decimais'
import type { Desconto, Despesa, Documento, Item, Tributo } from '@/lib/import/hub/dadosImportacoes'
import { sugerirCriterioRateio } from '@shared-core/src/import/sugestaoCriterio'
import { conferirLancamentoAction, removerRascunhoAction, salvarLancamentoAction, type TipoLancamento } from '../actions'
import { ErroFormulario, Selecao, Texto, useAcao, type TextosImport } from './campos'

const CRITERIOS = ['VALOR_ADUANEIRO', 'PESO_LIQUIDO', 'PESO_BRUTO', 'VOLUME', 'QUANTIDADE_ESTOQUE', 'IGUAL'] as const
const RECUPERABILIDADE = [
  'PENDENTE_VALIDACAO', 'NAO_RECUPERAVEL', 'RECUPERAVEL_POTENCIAL', 'RECUPERAVEL_RECONHECIDO', 'GLOSADO', 'NAO_APLICAVEL',
] as const

type Props = {
  t: TextosImport
  operacaoId: string
  itens: Item[]
  tributos: Tributo[]
  despesas: Despesa[]
  descontos: Desconto[]
  documentos?: Documento[]
  moedaPadrao: string
  editavel: boolean
}

type Form = { tipo: TipoLancamento; dados: Record<string, string> }

export function LancamentosSecao(props: Props) {
  const { t, editavel } = props
  const { executar, pendente, erro } = useAcao(t)
  const [form, setForm] = useState<Form | null>(null)
  const tk = (k: string) => (t as Record<string, string>)[k] ?? k
  const nomeItem = (id: string | null) => (id ? props.itens.find((i) => i.id === id)?.descricao ?? '—' : '—')
  const itensOpcoes = props.itens.map((i) => ({ valor: i.id, rotulo: i.descricao }))

  const conferencia = (tipo: 'DESPESA' | 'TRIBUTO', id: string, status: 'PENDENTE' | 'CONFERIDO') => (
    <div className="flex items-center gap-2">
      <StatusBadge tone={status === 'CONFERIDO' ? 'success' : 'warning'}>{tk(`conf_${status}`)}</StatusBadge>
      {editavel ? (
        <Button
          type="button"
          variant="ghost" size="sm"
          data-testid={`imp-conferir-${tipo.toLowerCase()}`}
          onClick={() => executar(() => conferirLancamentoAction(props.operacaoId, tipo, id, status === 'CONFERIDO' ? 'PENDENTE' : 'CONFERIDO'))}
        >
          {status === 'CONFERIDO' ? t.desconferir : t.conferir}
        </Button>
      ) : null}
    </div>
  )

  const acoes = (tipo: TipoLancamento, dados: Record<string, string>, id: string) =>
    editavel ? (
      <div className="flex gap-1 whitespace-nowrap">
        <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ tipo, dados })}>{t.editar}</Button>
        <Button
          type="button"
          variant="ghost" size="sm"
          onClick={() => { if (window.confirm(t.confirmar_remocao)) executar(() => removerRascunhoAction(props.operacaoId, tipo, id)) }}
        >
          {t.remover}
        </Button>
      </div>
    ) : null

  const tribDados = (x: Tributo): Record<string, string> => ({
    id: x.id, tributo_codigo: x.tributo_codigo, status_recuperabilidade: x.status_recuperabilidade,
    valor_apurado_brl: x.valor_apurado_brl, item_id: x.item_id ?? '', regra_id: x.regra_id ?? '',
    regra_incorpora_custo: String(x.regra_incorpora_custo ?? false), regra_vigencia_inicio: x.regra_vigencia_inicio ?? '',
    regra_vigencia_fim: x.regra_vigencia_fim ?? '', data_fato_gerador: x.data_fato_gerador ?? '', validado_por: x.validado_por ?? '',
    documento_id: x.documento_id ?? '',
  })
  const despDados = (x: Despesa): Record<string, string> => ({
    id: x.id, tipo: x.tipo, moeda: x.moeda, valor: x.valor, incorporavel: x.incorporavel, atribuicao_modo: x.atribuicao_modo,
    item_id: x.item_id ?? '', criterio: x.criterio ?? 'VALOR_ADUANEIRO', justificativa: x.justificativa,
    documento_id: x.documento_id ?? '',
  })
  const descDados = (x: Desconto): Record<string, string> => ({
    id: x.id, escopo: x.escopo, moeda: x.moeda, valor: x.valor, item_id: x.item_id ?? '', criterio: x.criterio ?? 'VALOR_ADUANEIRO',
    justificativa: x.justificativa, documento_id: x.documento_id ?? '',
  })

  const tabelaTributos = (lista: Tributo[], titulo: string, testId: string) => (
    <Grupo titulo={titulo} vazio={t.lanc_vazio} n={lista.length} testId={testId}>
      <thead>
        <tr className="text-left text-[11px] uppercase text-fg-subtle">
          <th scope="col" className="px-2 py-1">{t.trib_codigo}</th>
          <th scope="col" className="px-2 py-1">{t.trib_status}</th>
          <th scope="col" className="px-2 py-1 text-right">{t.trib_valor}</th>
          <th scope="col" className="px-2 py-1">{t.trib_item}</th>
          <th scope="col" className="px-2 py-1">{t.trib_regra}</th>
          <th scope="col" className="px-2 py-1">{t.conferencia}</th>
          <th scope="col" className="px-2 py-1"><span className="sr-only">{t.editar}</span></th>
        </tr>
      </thead>
      <tbody>
        {lista.map((x) => (
          <tr key={x.id} className="border-t border-[var(--color-border)]">
            <td className="px-2 py-1.5 font-medium">{x.tributo_codigo}</td>
            <td className="px-2 py-1.5">{tk(`rec_${x.status_recuperabilidade}`)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{formatarDecimal(x.valor_apurado_brl)}</td>
            <td className="px-2 py-1.5">{x.item_id ? nomeItem(x.item_id) : t.trib_item_nenhum}</td>
            <td className="px-2 py-1.5 text-xs">
              {x.regra_id ? `${x.regra_id}${x.regra_incorpora_custo ? ` · ${t.trib_regra_incorpora}` : ''} · ${x.regra_vigencia_inicio}${x.regra_vigencia_fim ? `–${x.regra_vigencia_fim}` : ''}` : '—'}
              {x.validado_por ? <div className="text-fg-subtle">{t.trib_validado_por}: {x.validado_por}</div> : null}
            </td>
            <td className="px-2 py-1.5">{conferencia('TRIBUTO', x.id, x.status_conferencia)}</td>
            <td className="px-2 py-1.5">{acoes('TRIBUTO', tribDados(x), x.id)}</td>
          </tr>
        ))}
      </tbody>
    </Grupo>
  )

  const tabelaDespesas = (lista: Despesa[], titulo: string, testId: string) => (
    <Grupo titulo={titulo} vazio={t.lanc_vazio} n={lista.length} testId={testId}>
      <thead>
        <tr className="text-left text-[11px] uppercase text-fg-subtle">
          <th scope="col" className="px-2 py-1">{t.desp_tipo}</th>
          <th scope="col" className="px-2 py-1 text-right">{t.desp_valor}</th>
          <th scope="col" className="px-2 py-1">{t.desp_incorporavel}</th>
          <th scope="col" className="px-2 py-1">{t.desp_atribuicao}</th>
          <th scope="col" className="px-2 py-1">{t.desp_justificativa}</th>
          <th scope="col" className="px-2 py-1">{t.conferencia}</th>
          <th scope="col" className="px-2 py-1"><span className="sr-only">{t.editar}</span></th>
        </tr>
      </thead>
      <tbody>
        {lista.map((x) => (
          <tr key={x.id} className="border-t border-[var(--color-border)]">
            <td className="px-2 py-1.5 font-medium">{x.tipo}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{x.moeda} {formatarDecimal(x.valor)}</td>
            <td className="px-2 py-1.5">{tk(`inc_${x.incorporavel}`)}</td>
            <td className="px-2 py-1.5">{x.atribuicao_modo === 'DIRETA' ? nomeItem(x.item_id) : tk(`crit_${x.criterio}`)}</td>
            <td className="px-2 py-1.5 text-xs">{x.justificativa}</td>
            <td className="px-2 py-1.5">{conferencia('DESPESA', x.id, x.status_conferencia)}</td>
            <td className="px-2 py-1.5">{acoes('DESPESA', despDados(x), x.id)}</td>
          </tr>
        ))}
      </tbody>
    </Grupo>
  )

  const grupoTrib = (s: string[]) => props.tributos.filter((x) => s.includes(x.status_recuperabilidade))

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title={t.lanc_tributos}
        subtitle={t.lanc_aviso_recuperabilidade}
        action={editavel ? (
          <Button type="button" variant="outline" data-testid="imp-trib-adicionar"
            onClick={() => setForm({ tipo: 'TRIBUTO', dados: { status_recuperabilidade: 'PENDENTE_VALIDACAO', regra_incorpora_custo: 'false' } })}>
            {t.trib_adicionar}
          </Button>
        ) : null}
      >
        {tabelaTributos(grupoTrib(['NAO_RECUPERAVEL']), t.lanc_tributos_nao_rec, 'imp-trib-nao-rec')}
        {tabelaTributos(grupoTrib(['RECUPERAVEL_RECONHECIDO']), t.lanc_creditos_rec, 'imp-trib-rec')}
        {tabelaTributos(grupoTrib(['RECUPERAVEL_POTENCIAL']), t.lanc_creditos_pot, 'imp-trib-pot')}
        {tabelaTributos(grupoTrib(['PENDENTE_VALIDACAO', 'GLOSADO', 'NAO_APLICAVEL']), t.lanc_outros_tributos, 'imp-trib-outros')}
      </SectionCard>

      <SectionCard
        title={t.lanc_despesas_compartilhadas}
        action={editavel ? (
          <Button type="button" variant="outline" data-testid="imp-desp-adicionar"
            onClick={() => setForm({ tipo: 'DESPESA', dados: { moeda: props.moedaPadrao, incorporavel: 'SIM', atribuicao_modo: 'RATEIO', criterio: 'VALOR_ADUANEIRO', idempotency_key: crypto.randomUUID() } })}>
            {t.desp_adicionar}
          </Button>
        ) : null}
      >
        {tabelaDespesas(props.despesas.filter((d) => d.atribuicao_modo === 'RATEIO'), t.lanc_despesas_compartilhadas, 'imp-desp-rateio')}
        {tabelaDespesas(props.despesas.filter((d) => d.atribuicao_modo === 'DIRETA'), t.lanc_despesas_diretas, 'imp-desp-diretas')}
      </SectionCard>

      <SectionCard
        title={t.lanc_descontos}
        action={editavel ? (
          <Button type="button" variant="outline" onClick={() => setForm({ tipo: 'DESCONTO', dados: { moeda: props.moedaPadrao, escopo: 'PROCESSO', criterio: 'VALOR_ADUANEIRO' } })}>
            {t.desc_adicionar}
          </Button>
        ) : null}
      >
        <Grupo titulo={t.lanc_descontos} vazio={t.lanc_vazio} n={props.descontos.length} testId="imp-descontos">
          <tbody>
            {props.descontos.map((x) => (
              <tr key={x.id} className="border-t border-[var(--color-border)]">
                <td className="px-2 py-1.5">{tk(`esc_${x.escopo}`)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{x.moeda} {formatarDecimal(x.valor)}</td>
                <td className="px-2 py-1.5">{x.escopo === 'ITEM' ? nomeItem(x.item_id) : tk(`crit_${x.criterio}`)}</td>
                <td className="px-2 py-1.5 text-xs">{x.justificativa}</td>
                <td className="px-2 py-1.5">{acoes('DESCONTO', descDados(x), x.id)}</td>
              </tr>
            ))}
          </tbody>
        </Grupo>
      </SectionCard>

      {form ? (
        <FormLancamento
          key={`${form.tipo}-${form.dados.id ?? 'novo'}`}
          t={t}
          form={form}
          itens={itensOpcoes}
          documentos={(props.documentos ?? []).map((d) => ({ valor: d.id, rotulo: `${d.tipo}${d.numero ? ` ${d.numero}` : ''} v${d.versao}` }))}
          pendente={pendente}
          erro={erro}
          onCancelar={() => setForm(null)}
          onSalvar={(dados) => executar(() => salvarLancamentoAction(props.operacaoId, form.tipo, dados), () => setForm(null), t.salvo)}
        />
      ) : null}
    </div>
  )
}

function Grupo({ titulo, vazio, n, testId, children }: { titulo: string; vazio: string; n: number; testId: string; children: ReactNode }) {
  return (
    <div className="mb-4" data-testid={testId}>
      <h3 className="mb-1 text-small font-semibold text-fg">{titulo}</h3>
      {n === 0 ? (
        <p className="text-small text-fg-subtle">{vazio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <caption className="sr-only">{titulo}</caption>
            {children}
          </table>
        </div>
      )}
    </div>
  )
}

function FormLancamento(props: {
  t: TextosImport
  form: Form
  itens: { valor: string; rotulo: string }[]
  documentos: { valor: string; rotulo: string }[]
  pendente: boolean
  erro: string | null
  onCancelar: () => void
  onSalvar: (dados: Record<string, string>) => void
}) {
  const { t, form } = props
  const [d, setD] = useState<Record<string, string>>(form.dados)
  const v = (k: string) => d[k] ?? ''
  const set = (k: string) => (x: string) => setD((s) => ({ ...s, [k]: x }))
  const tk = (k: string) => (t as Record<string, string>)[k] ?? k
  const itemOpcoes = [{ valor: '', rotulo: '—' }, ...props.itens]
  const criterios = CRITERIOS.map((c) => ({ valor: c, rotulo: tk(`crit_${c}`) }))
  const titulo = form.tipo === 'TRIBUTO' ? t.trib_adicionar : form.tipo === 'DESPESA' ? t.desp_adicionar : t.desc_adicionar

  return (
    <SectionCard title={titulo}>
      <form
        className="flex flex-col gap-3"
        aria-label={titulo}
        data-testid={`imp-form-${form.tipo.toLowerCase()}`}
        onSubmit={(e) => { e.preventDefault(); props.onSalvar(d) }}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {form.tipo === 'TRIBUTO' ? (
            <>
              <Texto rotulo={t.trib_codigo} valor={v('tributo_codigo')} onChange={(x) => set('tributo_codigo')(x.toUpperCase())} obrigatorio maxLength={20} testId="imp-trib-codigo" />
              <Selecao rotulo={t.trib_status} valor={v('status_recuperabilidade')} onChange={set('status_recuperabilidade')}
                opcoes={RECUPERABILIDADE.map((r) => ({ valor: r, rotulo: tk(`rec_${r}`) }))} testId="imp-trib-status" />
              <Texto rotulo={t.trib_valor} valor={v('valor_apurado_brl')} onChange={set('valor_apurado_brl')} modoNumerico obrigatorio testId="imp-trib-valor" />
              <Selecao rotulo={t.trib_item} valor={v('item_id')} onChange={set('item_id')} opcoes={[{ valor: '', rotulo: t.trib_item_nenhum }, ...props.itens]} testId="imp-trib-item" />
              <Texto rotulo={t.trib_regra} valor={v('regra_id')} onChange={set('regra_id')} maxLength={60} testId="imp-trib-regra" />
              <Selecao rotulo={t.trib_regra_incorpora} valor={v('regra_incorpora_custo') || 'false'} onChange={set('regra_incorpora_custo')}
                opcoes={[{ valor: 'true', rotulo: t.inc_SIM }, { valor: 'false', rotulo: t.inc_NAO }]} testId="imp-trib-incorpora" />
              <Texto rotulo={t.trib_vig_inicio} valor={v('regra_vigencia_inicio')} onChange={set('regra_vigencia_inicio')} tipo="date" testId="imp-trib-vig" />
              <Texto rotulo={t.trib_vig_fim} valor={v('regra_vigencia_fim')} onChange={set('regra_vigencia_fim')} tipo="date" />
              <Texto rotulo={t.trib_fato_gerador} valor={v('data_fato_gerador')} onChange={set('data_fato_gerador')} tipo="date" testId="imp-trib-fato" />
              <Texto rotulo={t.trib_validado_por} valor={v('validado_por')} onChange={set('validado_por')} maxLength={120} />
              <Selecao rotulo={t.lanc_documento} valor={v('documento_id')} onChange={set('documento_id')}
                opcoes={[{ valor: '', rotulo: t.lanc_documento_nenhum }, ...props.documentos]} testId="imp-lanc-documento" />
            </>
          ) : null}
          {form.tipo === 'DESPESA' ? (
            <>
              <Texto rotulo={t.desp_tipo} valor={v('tipo')} onChange={set('tipo')} obrigatorio maxLength={80} testId="imp-desp-tipo" />
              <Texto rotulo={t.desp_moeda} valor={v('moeda')} onChange={(x) => set('moeda')(x.toUpperCase())} maxLength={3} obrigatorio testId="imp-desp-moeda" />
              <Texto rotulo={t.desp_valor} valor={v('valor')} onChange={set('valor')} modoNumerico obrigatorio testId="imp-desp-valor" />
              <Selecao rotulo={t.desp_incorporavel} valor={v('incorporavel')} onChange={set('incorporavel')}
                opcoes={['SIM', 'NAO', 'DECISAO_03'].map((x) => ({ valor: x, rotulo: tk(`inc_${x}`) }))} />
              <Selecao rotulo={t.desp_atribuicao} valor={v('atribuicao_modo')} onChange={set('atribuicao_modo')}
                opcoes={['RATEIO', 'DIRETA'].map((x) => ({ valor: x, rotulo: tk(`atr_${x}`) }))} testId="imp-desp-atribuicao" />
              {v('atribuicao_modo') === 'DIRETA' ? (
                <Selecao rotulo={t.desp_item} valor={v('item_id')} onChange={set('item_id')} opcoes={itemOpcoes} obrigatorio />
              ) : (
                <Selecao rotulo={t.desp_criterio} valor={v('criterio')} onChange={set('criterio')} opcoes={criterios} testId="imp-desp-criterio" />
              )}
              <Selecao rotulo={t.lanc_documento} valor={v('documento_id')} onChange={set('documento_id')}
                opcoes={[{ valor: '', rotulo: t.lanc_documento_nenhum }, ...props.documentos]} testId="imp-lanc-documento" />
              {v('atribuicao_modo') !== 'DIRETA' && v('tipo').trim() ? (() => {
                const sug = sugerirCriterioRateio(v('tipo'))
                return (
                  <p className="flex flex-wrap items-center gap-2 text-xs md:col-span-3" data-testid="imp-desp-sugestao">
                    <span>{t.crit_sugerido}: <strong>{tk(`crit_${sug.criterio}`)}</strong> — {sug.motivo}</span>
                    {v('criterio') !== sug.criterio ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => set('criterio')(sug.criterio)} data-testid="imp-desp-usar-sugestao">{t.crit_usar_sugestao}</Button>
                    ) : <span className="text-fg-subtle">({t.crit_revisar})</span>}
                  </p>
                )
              })() : null}
              <Texto className="flex flex-col gap-1 md:col-span-3" rotulo={t.desp_justificativa} valor={v('justificativa')} onChange={set('justificativa')} obrigatorio maxLength={300} testId="imp-desp-justificativa" />
            </>
          ) : null}
          {form.tipo === 'DESCONTO' ? (
            <>
              <Selecao rotulo={t.desc_escopo} valor={v('escopo')} onChange={set('escopo')}
                opcoes={['PROCESSO', 'ITEM'].map((x) => ({ valor: x, rotulo: tk(`esc_${x}`) }))} />
              <Texto rotulo={t.desp_moeda} valor={v('moeda')} onChange={(x) => set('moeda')(x.toUpperCase())} maxLength={3} obrigatorio />
              <Texto rotulo={t.desp_valor} valor={v('valor')} onChange={set('valor')} modoNumerico obrigatorio />
              {v('escopo') === 'ITEM' ? (
                <Selecao rotulo={t.desp_item} valor={v('item_id')} onChange={set('item_id')} opcoes={itemOpcoes} obrigatorio />
              ) : (
                <Selecao rotulo={t.desp_criterio} valor={v('criterio')} onChange={set('criterio')} opcoes={criterios} />
              )}
              <Selecao rotulo={t.lanc_documento} valor={v('documento_id')} onChange={set('documento_id')}
                opcoes={[{ valor: '', rotulo: t.lanc_documento_nenhum }, ...props.documentos]} testId="imp-lanc-documento" />
              <Texto className="flex flex-col gap-1 md:col-span-3" rotulo={t.desp_justificativa} valor={v('justificativa')} onChange={set('justificativa')} obrigatorio maxLength={300} />
            </>
          ) : null}
        </div>
        <ErroFormulario mensagem={props.erro} />
        <div className="flex gap-2">
          <Button type="submit" disabled={props.pendente} data-testid="imp-lanc-salvar">{props.pendente ? t.salvando : t.salvar}</Button>
          <Button type="button" variant="outline" onClick={props.onCancelar} disabled={props.pendente}>{t.cancelar}</Button>
        </div>
      </form>
    </SectionCard>
  )
}
