'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/admin-v2'
import { formatarDecimal } from '@/lib/import/hub/decimais'
import type { Cambio, Operacao } from '@/lib/import/hub/dadosImportacoes'
import { removerRascunhoAction, salvarCabecalhoAction, salvarLancamentoAction } from '../actions'
import { ErroFormulario, Selecao, Texto, useAcao, type TextosImport } from './campos'

type Opcao = { id: string; nome: string }

export function ResumoSecao(props: {
  t: TextosImport
  operacao: Operacao
  lojaNome: string | null
  fornecedores: Opcao[]
  cambios: Cambio[]
  editavel: boolean
}) {
  const { t, operacao: o, editavel } = props
  const { executar, pendente, erro } = useAcao(t)
  const [f, setF] = useState({
    referencia: o.referencia,
    fornecedor_id: o.fornecedor_id ?? '',
    moeda: o.moeda ?? '',
    data_invoice: o.data_invoice ?? '',
    data_embarque: o.data_embarque ?? '',
    data_desembaraco: o.data_desembaraco ?? '',
    observacoes: o.descricao ?? '',
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title={t.cabecalho_titulo}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            executar(() => salvarCabecalhoAction(o.id, f), undefined, t.salvo)
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Texto rotulo={t.campo_referencia} valor={f.referencia} onChange={set('referencia')} obrigatorio maxLength={80} desabilitado={!editavel} />
            <div className="flex flex-col gap-1">
              <span className="text-small font-medium">{t.campo_importadora}</span>
              <span className="fp-control w-full text-small opacity-80" aria-readonly="true">
                {props.lojaNome ?? '—'}
              </span>
            </div>
            <Selecao
              rotulo={t.campo_fornecedor}
              valor={f.fornecedor_id}
              onChange={set('fornecedor_id')}
              desabilitado={!editavel}
              opcoes={[{ valor: '', rotulo: t.campo_fornecedor_nenhum }, ...props.fornecedores.map((x) => ({ valor: x.id, rotulo: x.nome }))]}
            />
            <Texto rotulo={t.campo_moeda} valor={f.moeda} onChange={(v) => set('moeda')(v.toUpperCase())} maxLength={3} desabilitado={!editavel} />
            <Texto rotulo={t.campo_data_invoice} valor={f.data_invoice} onChange={set('data_invoice')} tipo="date" desabilitado={!editavel} />
            <Texto rotulo={t.campo_data_embarque} valor={f.data_embarque} onChange={set('data_embarque')} tipo="date" desabilitado={!editavel} />
            <Texto rotulo={t.campo_data_desembaraco} valor={f.data_desembaraco} onChange={set('data_desembaraco')} tipo="date" desabilitado={!editavel} />
            <Texto rotulo={t.campo_observacoes} valor={f.observacoes} onChange={set('observacoes')} maxLength={500} desabilitado={!editavel} />
          </div>
          <ErroFormulario mensagem={erro} />
          {editavel ? (
            <div>
              <Button type="submit" disabled={pendente || !f.referencia.trim()} data-testid="imp-salvar-cabecalho">
                {pendente ? t.salvando : t.salvar}
              </Button>
            </div>
          ) : null}
        </form>
      </SectionCard>

      <CambiosCard t={t} operacaoId={o.id} cambios={props.cambios} editavel={editavel} />
    </div>
  )
}

function CambiosCard({ t, operacaoId, cambios, editavel }: { t: TextosImport; operacaoId: string; cambios: Cambio[]; editavel: boolean }) {
  const { executar, pendente, erro } = useAcao(t)
  const vazio = { id: '', moeda: 'USD', taxa: '', fonte: 'DECLARADA_DI', data: '' }
  const [f, setF] = useState(vazio)
  const set = (k: keyof typeof vazio) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  return (
    <SectionCard title={t.cambio_titulo}>
      {cambios.length === 0 ? (
        <p className="mb-3 text-small text-fg-subtle">{t.cambio_vazio}</p>
      ) : (
        <table className="mb-3 w-full text-small" data-testid="imp-cambios">
          <caption className="sr-only">{t.cambio_titulo}</caption>
          <thead>
            <tr className="text-left text-[11px] uppercase text-fg-subtle">
              <th scope="col" className="py-1">{t.cambio_moeda}</th>
              <th scope="col" className="py-1 text-right">{t.cambio_taxa}</th>
              <th scope="col" className="py-1">{t.cambio_fonte}</th>
              <th scope="col" className="py-1">{t.cambio_data}</th>
              {editavel ? <th scope="col" className="py-1"><span className="sr-only">{t.editar}</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {cambios.map((c) => (
              <tr key={c.id} className="border-t border-[var(--color-border)]">
                <td className="py-1.5 font-medium">{c.moeda}</td>
                <td className="py-1.5 text-right tabular-nums">{formatarDecimal(c.taxa)}</td>
                <td className="py-1.5">{t[`fonte_${c.fonte}` as keyof TextosImport] ?? c.fonte}</td>
                <td className="py-1.5 tabular-nums">{c.data}</td>
                {editavel ? (
                  <td className="py-1.5 text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setF({ ...c, taxa: c.taxa })}>
                      {t.editar}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost" size="sm"
                      onClick={() => {
                        if (window.confirm(t.confirmar_remocao)) executar(() => removerRascunhoAction(operacaoId, 'CAMBIO', c.id))
                      }}
                    >
                      {t.remover}
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editavel ? (
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            executar(() => salvarLancamentoAction(operacaoId, 'CAMBIO', f), () => setF(vazio), t.salvo)
          }}
        >
          <Texto rotulo={t.cambio_moeda} valor={f.moeda} onChange={(v) => set('moeda')(v.toUpperCase())} maxLength={3} obrigatorio />
          <Texto rotulo={t.cambio_taxa} valor={f.taxa} onChange={set('taxa')} modoNumerico obrigatorio testId="imp-cambio-taxa" />
          <Selecao
            rotulo={t.cambio_fonte}
            valor={f.fonte}
            onChange={set('fonte')}
            opcoes={['DECLARADA_DI', 'MANUAL', 'OUTRA'].map((v) => ({ valor: v, rotulo: t[`fonte_${v}` as keyof TextosImport] }))}
          />
          <Texto rotulo={t.cambio_data} valor={f.data} onChange={set('data')} tipo="date" obrigatorio />
          <div className="md:col-span-2">
            <ErroFormulario mensagem={erro} />
            <Button type="submit" variant="outline" disabled={pendente} data-testid="imp-cambio-salvar">
              {pendente ? t.salvando : t.salvar}
            </Button>
          </div>
        </form>
      ) : null}
    </SectionCard>
  )
}
