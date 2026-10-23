'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { adminImportacaoHref } from '@/lib/navigation/routes'
import { criarImportacaoAction } from '../actions'
import { opcoesMoeda } from '@/lib/import/hub/formImportacao'
import { ErroFormulario, Selecao, Texto, useAcao, type TextosImport } from './campos'

type Opcao = { id: string; nome: string }

export function NovaImportacaoForm({ t, lojas, fornecedores }: { t: TextosImport; lojas: Opcao[]; fornecedores: Opcao[] }) {
  const router = useRouter()
  const { executar, pendente, erro } = useAcao(t)
  const [aberto, setAberto] = useState(false)
  const [f, setF] = useState({
    loja_importadora_id: lojas.length === 1 ? lojas[0].id : '',
    referencia: '',
    fornecedor_id: '',
    moeda: 'USD',
    data_invoice: '',
    observacoes: '',
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  if (!aberto) {
    return (
      <Button type="button" data-testid="imp-nova" onClick={() => setAberto(true)}>
        {t.nova}
      </Button>
    )
  }

  const valido = f.loja_importadora_id && f.referencia.trim().length > 0
  return (
    <form
      className="flex w-full flex-col gap-3 rounded-card border border-[var(--color-border)] p-4"
      aria-label={t.nova}
      data-testid="imp-nova-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valido) return
        executar(() => criarImportacaoAction(f), (d) => router.push(adminImportacaoHref(d.id, { aba: 'mercadorias' })), t.salvo)
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Texto rotulo={t.campo_referencia} valor={f.referencia} onChange={set('referencia')} obrigatorio maxLength={80} testId="imp-ref" />
        <Selecao
          rotulo={t.campo_importadora}
          valor={f.loja_importadora_id}
          onChange={set('loja_importadora_id')}
          obrigatorio
          opcoes={[{ valor: '', rotulo: '—' }, ...lojas.map((l) => ({ valor: l.id, rotulo: l.nome }))]}
          testId="imp-loja"
        />
        <Selecao
          rotulo={t.campo_fornecedor}
          valor={f.fornecedor_id}
          onChange={set('fornecedor_id')}
          opcoes={[{ valor: '', rotulo: t.campo_fornecedor_nenhum }, ...fornecedores.map((x) => ({ valor: x.id, rotulo: x.nome }))]}
        />
        <Selecao rotulo={t.campo_moeda} valor={f.moeda} onChange={set('moeda')} opcoes={opcoesMoeda(f.moeda)} testId="imp-moeda" />
        <Texto rotulo={t.campo_data_invoice} valor={f.data_invoice} onChange={set('data_invoice')} tipo="date" />
        <Texto rotulo={t.campo_observacoes} valor={f.observacoes} onChange={set('observacoes')} maxLength={500} />
      </div>
      <ErroFormulario mensagem={erro} />
      <div className="flex gap-2">
        <Button type="submit" disabled={!valido || pendente} data-testid="imp-criar">
          {pendente ? t.criando : t.criar}
        </Button>
        <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={pendente}>
          {t.cancelar}
        </Button>
      </div>
    </form>
  )
}
