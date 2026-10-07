'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatBRL } from '@/lib/format/money'
import { SectionCard } from '@/components/ui/admin-v2'
import { ROUTES, adminVendaDetalheQuery } from '@/lib/navigation/routes'
import type { FinanceiroPainel, FinanceiroConta, FinanceiroMovimento } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { CategoriaOptions, ContaOptions } from './FinanceiroOptions'
import { executarFinanceiroLoja } from '../financeiroLojaActions'
import { useRouter } from 'next/navigation'

const FORMAS = [
  { id: 'DINHEIRO', label: 'Dinheiro (gaveta / reserva)' },
  { id: 'PIX', label: 'PIX → banco' },
  { id: 'CARTAO_CREDITO', label: 'Cartão crédito → a receber no banco' },
  { id: 'CARTAO_DEBITO', label: 'Cartão débito → a receber no banco' },
] as const

type Labels = {
  saldosTitulo: string
  saldoRegistrado: string
  saldoRegistradoHint: string
  tipoBanco: string
  tipoCaixa: string
  inativa: string
  entradasPeriodo: string
  saidasPeriodo: string
  verExtrato: string
  extratoTitulo: string
  colData: string
  colDesc: string
  colValor: string
  colOrigem: string
  colUsuario: string
  cadastrarTitulo: string
  nomeConta: string
  tipoConta: string
  dataInicial: string
  saldoInicial: string
  transferirTitulo: string
  vincularPdv: string
  vincularPdvHint: string
  movimentoAvulso: string
  movimentoAvulsoHint: string
  formasTitulo: string
  formasHint: string
  formaCodigo: string
  formaConta: string
  formaSemConta: string
  salvarVinculo: string
  inativar: string
  inativarConfirm: string
  origemDoc: string
  semMovimentos: string
}

function tipoLabel(tipo: string, labels: Labels): string {
  return tipo === 'BANCO' ? labels.tipoBanco : labels.tipoCaixa
}

function origemHref(m: FinanceiroMovimento): string | null {
  if (!m.origem_id) return null
  if (m.origem === 'RECEBIVEL_VENDA' || m.descricao.includes('Venda ')) {
    const match = m.descricao.match(/Venda\s([0-9a-f-]{36})/i)
    if (match) return adminVendaDetalheQuery(match[1])
  }
  if (m.origem === 'TRANSFERENCIA_PDV') return ROUTES.admin.caixas
  return null
}

function ContaCard({
  conta,
  labels,
  selected,
  onSelect,
  onInativar,
}: {
  conta: FinanceiroConta
  labels: Labels
  selected: boolean
  onSelect: () => void
  onInativar: () => void
}) {
  return (
    <li
      className={`rounded-lg border p-3 ${selected ? 'border-[var(--color-brand)] bg-jl-surface-soft' : 'border-[var(--color-border-secondary)]'} ${conta.ativo ? '' : 'opacity-60'}`}
    >
      <button type="button" className="w-full text-left focus-visible:outline-none focus-visible:shadow-focus" onClick={onSelect}>
        <p className="font-medium text-jl-fg-1">{conta.nome}{!conta.ativo ? ` · ${labels.inativa}` : ''}</p>
        <p className="text-xl font-semibold tabular-nums">{formatBRL(conta.saldo)}</p>
        <p className="text-caption text-jl-fg-3">{labels.saldoRegistrado} · {tipoLabel(conta.tipo, labels)}</p>
        <p className="mt-1 text-caption text-jl-fg-3">
          {labels.entradasPeriodo}: {formatBRL(conta.entradas_periodo ?? 0)} · {labels.saidasPeriodo}:{' '}
          {formatBRL(conta.saidas_periodo ?? 0)}
        </p>
      </button>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="admin-v2-btn-secondary text-small" onClick={onSelect}>
          {labels.verExtrato}
        </button>
        {conta.ativo ? (
          <button type="button" className="admin-v2-btn-secondary text-small text-[var(--color-danger-strong)]" onClick={onInativar}>
            {labels.inativar}
          </button>
        ) : null}
      </div>
    </li>
  )
}

function ExtratoConta({
  conta,
  movimentos,
  labels,
}: {
  conta: FinanceiroConta
  movimentos: FinanceiroMovimento[]
  labels: Labels
}) {
  const rows = movimentos.filter((m) => m.conta_financeira_id === conta.id)
  return (
    <SectionCard title={`${labels.extratoTitulo}: ${conta.nome}`}>
      <p className="mb-2 text-small text-jl-fg-3">{labels.saldoRegistradoHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr>
              {[labels.colData, labels.colDesc, labels.colValor, labels.colOrigem, labels.colUsuario, labels.origemDoc].map((h) => (
                <th key={h} className="p-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const href = origemHref(m)
              return (
                <tr key={m.id} className="border-t border-[var(--color-border-secondary)]">
                  <td className="p-2 whitespace-nowrap">{m.data}</td>
                  <td className="p-2">
                    {m.descricao}
                    {m.estornado ? ' · estornado' : ''}
                  </td>
                  <td className="p-2 tabular-nums">{formatBRL(m.valor)}</td>
                  <td className="p-2">{m.origem}</td>
                  <td className="p-2">{m.usuario_nome ?? '—'}</td>
                  <td className="p-2">
                    {href ? (
                      <Link className="underline" href={href}>
                        {labels.origemDoc}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!rows.length ? <p className="py-3 text-small text-jl-fg-3">{labels.semMovimentos}</p> : null}
    </SectionCard>
  )
}

export function FinanceiroContas({ data, labels }: { data: FinanceiroPainel; labels: Labels }) {
  const router = useRouter()
  const [selecionada, setSelecionada] = useState<string | null>(data.contas[0]?.id ?? null)
  const [pendingInativar, setPendingInativar] = useState(false)
  const conta = data.contas.find((c) => c.id === selecionada) ?? null
  const contasForma = data.contas_forma ?? []

  async function inativar(contaId: string) {
    if (!window.confirm(labels.inativarConfirm)) return
    setPendingInativar(true)
    try {
      const result = await executarFinanceiroLoja({
        tipo: 'INATIVAR_CONTA',
        dados: { conta_id: contaId },
        requestId: crypto.randomUUID(),
      })
      if (result.ok) router.refresh()
      else window.alert(result.error)
    } finally {
      setPendingInativar(false)
    }
  }

  return (
    <div className="admin-v2-stack">
      <SectionCard title={labels.saldosTitulo}>
        <p className="mb-3 text-small text-jl-fg-3">{labels.saldoRegistradoHint}</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.contas.map((c) => (
            <ContaCard
              key={c.id}
              conta={c}
              labels={labels}
              selected={selecionada === c.id}
              onSelect={() => setSelecionada(c.id)}
              onInativar={() => {
                if (!pendingInativar) void inativar(c.id)
              }}
            />
          ))}
        </ul>
        {!data.contas.length ? <p className="mt-2 text-small">Cadastre uma conta e informe o saldo conferido na data inicial.</p> : null}
      </SectionCard>

      {conta ? <ExtratoConta conta={conta} movimentos={data.movimentos} labels={labels} /> : null}

      <FinanceiroForm title="Ativar ou inativar conta" tipo="ALTERAR_CONTA" operacional>
        <Field name="conta_id" label="Conta">
          <ContaOptions data={data} incluirInativas />
        </Field>
        <Field name="nome" label="Nome (opcional)" required={false} />
        <Field name="ativo" label="Situação">
          <option value="true">Ativa</option>
          <option value="false">Inativa</option>
        </Field>
      </FinanceiroForm>

      <FinanceiroForm title={labels.formasTitulo} tipo="CONFIGURAR_CONTA_FORMA" operacional submit={labels.salvarVinculo}>
        <p className="text-small sm:col-span-2">{labels.formasHint}</p>
        <p className="text-small sm:col-span-2">
          Vale apenas para vendas e baixas novas. Não relança histórico nem reconstrói saldos. Dinheiro continua na
          gaveta do PDV; reserve só se quiser espelho de numerário fora do turno.
        </p>
        <Field name="forma_pagamento" label={labels.formaCodigo}>
          {FORMAS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </Field>
        <Field name="conta_id" label={labels.formaConta} required={false}>
          <option value="">{labels.formaSemConta}</option>
          <ContaOptions data={data} />
        </Field>
        {contasForma.length ? (
          <ul className="sm:col-span-2 text-small text-jl-fg-3">
            {contasForma.map((f) => (
              <li key={f.forma_pagamento}>
                {f.forma_pagamento}: {f.conta_nome ?? 'não configurada'}
              </li>
            ))}
          </ul>
        ) : null}
      </FinanceiroForm>

      <FinanceiroForm
        title={labels.cadastrarTitulo}
        tipo="CRIAR_CONTA"
        transform={(d) => {
          const r = { ...d }
          if (!r.valor || Number(r.valor) === 0) delete r.valor
          return r
        }}
      >
        <Field name="nome" label={labels.nomeConta} />
        <Field name="tipo" label={labels.tipoConta}>
          <option value="RESERVA">{labels.tipoCaixa}</option>
          <option value="BANCO">{labels.tipoBanco}</option>
        </Field>
        <Field name="data" label={labels.dataInicial} type="date" value={data.hoje} />
        <Field name="valor" label={labels.saldoInicial} type="number" value={0} required={false} />
      </FinanceiroForm>

      <FinanceiroForm title={labels.transferirTitulo} tipo="TRANSFERIR">
        <Field name="conta_id" label="Origem">
          <ContaOptions data={data} />
        </Field>
        <Field name="destino_id" label="Destino">
          <ContaOptions data={data} />
        </Field>
        <Field name="valor" label="Valor (R$)" type="number" />
        <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
      </FinanceiroForm>

      <FinanceiroForm title={labels.vincularPdv} tipo="VINCULAR_CAIXA">
        <p className="text-small sm:col-span-2">{labels.vincularPdvHint}</p>
        <Field name="movimento_id" label="Sangria / suprimento aprovado">
          <option value="">Selecione</option>
          {data.movimentos_caixa.map((m) => (
            <option key={m.id} value={m.id}>
              {m.tipo} · {formatBRL(m.valor)} · {m.caixa_id.slice(0, 8)}
            </option>
          ))}
        </Field>
        <Field name="conta_id" label="Conta de contrapartida">
          <ContaOptions data={data} />
        </Field>
        <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
      </FinanceiroForm>

      <FinanceiroForm title={labels.movimentoAvulso} tipo="MOVIMENTO">
        <p className="text-small sm:col-span-2">{labels.movimentoAvulsoHint}</p>
        <Field name="conta_id" label="Conta">
          <ContaOptions data={data} />
        </Field>
        <Field name="direcao" label="Direção">
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saída</option>
        </Field>
        <Field name="categoria_id" label="Categoria">
          <CategoriaOptions data={data} />
        </Field>
        <Field name="descricao" label="Descrição" />
        <Field name="valor" label="Valor (R$)" type="number" />
        <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
      </FinanceiroForm>
    </div>
  )
}
