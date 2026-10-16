'use client'

/**
 * Faixa fixa de ações rápidas do Financeiro.
 * Reutiliza fluxos oficiais (PDV, BAIXAR_AR/AP, TRANSFERIR) — não cria segundo financeiro.
 */

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowLeftRight,
  Banknote,
  HandCoins,
  ShoppingCart,
} from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { ROUTES } from '@/lib/navigation/routes'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { FinanceiroForm, FinanceiroField as Field } from './FinanceiroForm'
import { ContaOptions, CategoriaOptions } from './FinanceiroOptions'
import { formatBRL } from '@/lib/format/money'
import { useTextosBaixaForm } from './textosBaixaForm'

export type FinanceiroAcaoRapida = 'venda' | 'receber' | 'pagar' | 'transferir' | null

type Labels = {
  faixaAria: string
  registrarVenda: string
  receber: string
  pagar: string
  transferir: string
  vendaTitulo: string
  vendaTexto: string
  vendaPdv: string
  vendaBuscar: string
  receberTitulo: string
  pagarTitulo: string
  transferirTitulo: string
  avulsoHint: string
  confirmarReceber: string
  confirmarPagar: string
  confirmarTransferir: string
  saldoRegistrado: string
}

type Props = {
  data?: FinanceiroPainel
  labels: Labels
}

const BTN =
  'inline-flex min-h-14 min-w-[9.5rem] flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-elev px-3 text-[18px] font-semibold text-jl-fg-1 shadow-sm transition hover:bg-jl-surface-soft focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50 sm:flex-none'

function PainelShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <DragonModal open={open} onClose={onClose} title={title} size="lg">
      <div className="admin-v2-stack max-h-[70vh] overflow-y-auto p-1">{children}</div>
    </DragonModal>
  )
}

export function FinanceiroAcoesRapidas({ data, labels }: Props) {
  const textos = useTextosBaixaForm()
  const [acao, setAcao] = useState<FinanceiroAcaoRapida>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAcao(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const titulosReceber = (data?.receber ?? []).filter((t) => !['PAGO', 'QUITADO', 'CANCELADO'].includes(t.status))
  const titulosPagar = (data?.pagar ?? []).filter((t) => !['PAGO', 'QUITADO', 'CANCELADO'].includes(t.status))

  return (
    <>
      <div
        className="sticky top-0 z-20 -mx-1 mb-4 border-b border-[var(--color-border-secondary)] bg-[color-mix(in_srgb,var(--jl-surface-base)_95%,transparent)] px-1 py-3 backdrop-blur"
        role="toolbar"
        aria-label={labels.faixaAria}
      >
        <p className="mb-2 text-caption text-jl-fg-3">{labels.saldoRegistrado}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={() => setAcao('venda')}>
            <ShoppingCart className="h-5 w-5 shrink-0" aria-hidden />
            {labels.registrarVenda}
          </button>
          <button type="button" className={BTN} onClick={() => setAcao('receber')} disabled={!data}>
            <HandCoins className="h-5 w-5 shrink-0" aria-hidden />
            {labels.receber}
          </button>
          <button type="button" className={BTN} onClick={() => setAcao('pagar')} disabled={!data}>
            <Banknote className="h-5 w-5 shrink-0" aria-hidden />
            {labels.pagar}
          </button>
          <button type="button" className={BTN} onClick={() => setAcao('transferir')} disabled={!data}>
            <ArrowLeftRight className="h-5 w-5 shrink-0" aria-hidden />
            {labels.transferir}
          </button>
        </div>
      </div>

      <PainelShell open={acao === 'venda'} title={labels.vendaTitulo} onClose={() => setAcao(null)}>
        <p className="text-small text-jl-fg-2">{labels.vendaTexto}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={ROUTES.caixa.home} className="admin-v2-btn-primary inline-flex min-h-14 items-center px-4 text-[18px]">
            {labels.vendaPdv}
          </Link>
          <Link href={ROUTES.admin.vendas} className="admin-v2-btn-secondary inline-flex min-h-14 items-center px-4 text-[18px]">
            {labels.vendaBuscar}
          </Link>
        </div>
      </PainelShell>

      {data ? (
        <>
          <PainelShell open={acao === 'receber'} title={labels.receberTitulo} onClose={() => setAcao(null)}>
            <p className="mb-3 text-small text-jl-fg-3">{labels.avulsoHint}</p>
            <FinanceiroForm title={labels.receberTitulo} tipo="BAIXAR_AR" submit={labels.confirmarReceber}>
              <Field name="titulo_id" label={textos.tituloReceber}>
                <option value="">{textos.selecione}</option>
                {titulosReceber.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} · {t.descricao} · {formatBRL(t.valor_aberto ?? t.valor_total - (t.valor_pago ?? 0))}
                  </option>
                ))}
              </Field>
              <Field name="conta_id" label={textos.contaDestino}>
                <ContaOptions data={data} />
              </Field>
              <Field name="valor" label={textos.valor} type="number" />
              <Field name="data" label={textos.data} type="date" value={data.hoje} />
              <Field name="descricao" label="Observação / comprovante" required={false} />
            </FinanceiroForm>
            <FinanceiroForm title="Lançamento avulso (entrada)" tipo="MOVIMENTO" submit={labels.confirmarReceber} fixed={{ direcao: 'ENTRADA' }}>
              <Field name="conta_id" label={textos.contaDestino}>
                <ContaOptions data={data} />
              </Field>
              <Field name="categoria_id" label="Categoria">
                <CategoriaOptions data={data} tipo="RECEITA" />
              </Field>
              <Field name="descricao" label="Descrição" />
              <Field name="valor" label={textos.valor} type="number" />
              <Field name="data" label={textos.data} type="date" value={data.hoje} />
            </FinanceiroForm>
          </PainelShell>

          <PainelShell open={acao === 'pagar'} title={labels.pagarTitulo} onClose={() => setAcao(null)}>
            <p className="mb-3 text-small text-jl-fg-3">{labels.avulsoHint}</p>
            <FinanceiroForm title={labels.pagarTitulo} tipo="BAIXAR_AP" submit={labels.confirmarPagar}>
              <Field name="titulo_id" label={textos.tituloPagar}>
                <option value="">{textos.selecione}</option>
                {titulosPagar.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} · {t.descricao} · {formatBRL(t.valor_aberto ?? t.valor_total - (t.valor_pago ?? 0))}
                  </option>
                ))}
              </Field>
              <Field name="conta_id" label={textos.contaOrigem}>
                <ContaOptions data={data} />
              </Field>
              <Field name="valor" label={textos.valor} type="number" />
              <Field name="data" label={textos.data} type="date" value={data.hoje} />
              <Field name="descricao" label="Observação / comprovante" required={false} />
            </FinanceiroForm>
            <FinanceiroForm title={textos.novaDespesa} tipo="CRIAR_AP" submit={labels.confirmarPagar}>
              <Field name="descricao" label="Descrição" />
              <Field name="favorecido" label="Favorecido" required={false} />
              <Field name="categoria_id" label="Categoria">
                <CategoriaOptions data={data} tipo="DESPESA" />
              </Field>
              <Field name="valor" label={textos.valor} type="number" />
              <Field name="data" label={textos.primeiroVencimento} type="date" value={data.hoje} />
              <Field name="competencia" label={textos.competencia} type="date" value={data.hoje} />
              <Field name="parcelas" label="Parcelas" type="number" value={1} />
              <Field name="recorrente" label="Como gerar">
                <option value="false">Dividir o valor</option>
                <option value="true">Repetir mensalmente</option>
              </Field>
            </FinanceiroForm>
          </PainelShell>

          <PainelShell open={acao === 'transferir'} title={labels.transferirTitulo} onClose={() => setAcao(null)}>
            <FinanceiroForm title={labels.transferirTitulo} tipo="TRANSFERIR" submit={labels.confirmarTransferir}>
              <Field name="conta_id" label={textos.contaOrigem}>
                <ContaOptions data={data} />
              </Field>
              <Field name="destino_id" label={textos.contaDestino}>
                <ContaOptions data={data} />
              </Field>
              <Field name="valor" label={textos.valor} type="number" />
              <Field name="data" label={textos.data} type="date" value={data.hoje} />
            </FinanceiroForm>
          </PainelShell>
        </>
      ) : null}
    </>
  )
}
