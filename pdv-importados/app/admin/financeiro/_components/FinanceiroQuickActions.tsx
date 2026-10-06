'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, Banknote, ShoppingCart, Wallet } from 'lucide-react'
import { OperationalQuickActions } from '@/components/ui/OperationalQuickActions'
import { ROUTES } from '@/lib/navigation/routes'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { ContaOptions, CategoriaOptions } from './FinanceiroOptions'
import { formatBRL } from '@/lib/format/money'

const textos = {
  pt: {
    title: 'Ações rápidas',
    venda: 'Registrar venda',
    receber: 'Receber',
    pagar: 'Pagar / despesa',
    transferir: 'Transferir',
    receberTitulo: 'Receber título ou entrada avulsa',
    pagarTitulo: 'Pagar obrigação ou registrar despesa',
    transferirTitulo: 'Transferir entre contas',
    fechar: 'Fechar',
  },
  zh: {
    title: '快捷操作',
    venda: '登记销售',
    receber: '收款',
    pagar: '付款 / 费用',
    transferir: '转账',
    receberTitulo: '收取应收或登记入账',
    pagarTitulo: '支付应付或登记费用',
    transferirTitulo: '账户间转账',
    fechar: '关闭',
  },
} as const

type Painel = 'receber' | 'pagar' | 'transferir' | null

export function FinanceiroQuickActions({ data, idioma = 'pt' }: { data: FinanceiroPainel; idioma?: 'pt' | 'zh' }) {
  const router = useRouter()
  const [painel, setPainel] = useState<Painel>(null)
  const t = textos[idioma]
  const receberAbertos = useMemo(
    () => data.receber.filter((item) => !['PAGO', 'QUITADO', 'CANCELADO'].includes(item.status)),
    [data.receber],
  )
  const pagarAbertos = useMemo(
    () => data.pagar.filter((item) => !['PAGO', 'QUITADO', 'CANCELADO'].includes(item.status)),
    [data.pagar],
  )

  return (
    <div className="admin-v2-stack">
      <OperationalQuickActions
        title={t.title}
        actions={[
          {
            id: 'venda',
            label: t.venda,
            icon: <ShoppingCart />,
            onClick: () => router.push(ROUTES.caixa.home),
          },
          {
            id: 'receber',
            label: t.receber,
            icon: <Wallet />,
            onClick: () => setPainel('receber'),
          },
          {
            id: 'pagar',
            label: t.pagar,
            icon: <Banknote />,
            onClick: () => setPainel('pagar'),
          },
          {
            id: 'transferir',
            label: t.transferir,
            icon: <ArrowLeftRight />,
            onClick: () => setPainel('transferir'),
          },
        ]}
      />

      {painel ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center"
          onClick={() => setPainel(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-[var(--color-surface)] p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-jl-fg-1">
                {painel === 'receber' ? t.receberTitulo : painel === 'pagar' ? t.pagarTitulo : t.transferirTitulo}
              </h2>
              <button type="button" className="admin-v2-btn-secondary" onClick={() => setPainel(null)}>
                {t.fechar}
              </button>
            </div>

            {painel === 'receber' ? (
              <div className="admin-v2-stack">
                <FinanceiroForm title="Baixar título a receber" tipo="BAIXAR_AR">
                  <Field name="titulo_id" label="Título">
                    <option value="">Selecione</option>
                    {receberAbertos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} · {formatBRL(item.valor_aberto ?? item.valor_total - (item.valor_pago ?? 0))}
                      </option>
                    ))}
                  </Field>
                  <Field name="conta_id" label="Conta destino">
                    <ContaOptions data={data} />
                  </Field>
                  <Field name="valor" label="Valor (R$)" type="number" />
                  <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
                  <Field name="descricao" label="Observação" required={false} />
                </FinanceiroForm>
                <FinanceiroForm title="Entrada avulsa autorizada" tipo="MOVIMENTO" fixed={{ direcao: 'ENTRADA' }}>
                  <Field name="conta_id" label="Conta">
                    <ContaOptions data={data} />
                  </Field>
                  <Field name="categoria_id" label="Categoria">
                    <CategoriaOptions data={data} tipo="RECEITA" />
                  </Field>
                  <Field name="descricao" label="Descrição" />
                  <Field name="valor" label="Valor (R$)" type="number" />
                  <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
                </FinanceiroForm>
              </div>
            ) : null}

            {painel === 'pagar' ? (
              <div className="admin-v2-stack">
                <FinanceiroForm title="Baixar obrigação" tipo="BAIXAR_AP">
                  <Field name="titulo_id" label="Título">
                    <option value="">Selecione</option>
                    {pagarAbertos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} · {formatBRL(item.valor_aberto ?? item.valor_total - (item.valor_pago ?? 0))}
                      </option>
                    ))}
                  </Field>
                  <Field name="conta_id" label="Conta de origem">
                    <ContaOptions data={data} />
                  </Field>
                  <Field name="valor" label="Valor (R$)" type="number" />
                  <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
                  <Field name="descricao" label="Observação" required={false} />
                </FinanceiroForm>
                <FinanceiroForm title="Registrar despesa" tipo="CRIAR_AP">
                  <Field name="descricao" label="Descrição" />
                  <Field name="favorecido" label="Favorecido" required={false} />
                  <Field name="categoria_id" label="Categoria">
                    <CategoriaOptions data={data} tipo="DESPESA" />
                  </Field>
                  <Field name="valor" label="Valor (R$)" type="number" />
                  <Field name="data" label="Vencimento" type="date" value={data.hoje} />
                  <Field name="competencia" label="Competência" type="date" value={data.hoje} />
                  <Field name="parcelas" label="Parcelas" type="number" value={1} />
                </FinanceiroForm>
              </div>
            ) : null}

            {painel === 'transferir' ? (
              <FinanceiroForm title="Transferir entre contas" tipo="TRANSFERIR">
                <Field name="conta_id" label="Origem">
                  <ContaOptions data={data} />
                </Field>
                <Field name="destino_id" label="Destino">
                  <ContaOptions data={data} />
                </Field>
                <Field name="valor" label="Valor (R$)" type="number" />
                <Field name="data" label="Data efetiva" type="date" value={data.hoje} />
              </FinanceiroForm>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
