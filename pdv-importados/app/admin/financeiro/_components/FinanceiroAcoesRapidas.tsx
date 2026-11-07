'use client'

/**
 * Operações do Financeiro, cada uma no seu contexto (Sprint 2).
 * Não há mais faixa fixa: cada aba mostra só os botões que lhe cabem e abre o
 * mesmo modal oficial (PDV, BAIXAR_AR/AP, CRIAR_AP, TRANSFERIR). Não cria segundo financeiro.
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
import { FinanceiroDespesaForm } from './FinanceiroDespesaForm'
import { formatBRL } from '@/lib/format/money'
import { opcoesComFoco, type FocoTituloConta } from './baixaLinha'
import { useTextosBaixaForm } from './textosBaixaForm'
import { useAdminV2Session } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { getMessages } from '@/i18n/getMessages'

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
}

type Props = {
  data?: FinanceiroPainel
  labels: Labels
  /** Quais operações este contexto oferece. */
  mostrar: Exclude<FinanceiroAcaoRapida, null>[]
  /** Modo controlado: o pai decide qual modal está aberto. Sem ele, o estado é interno. */
  acao?: FinanceiroAcaoRapida
  onAcao?: (acao: FinanceiroAcaoRapida) => void
  /** Título clicado numa linha: o modal de Receber/Pagar já abre com ele selecionado. */
  foco?: FocoTituloConta | null
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

/** Rótulos das operações no idioma da sessão. Fonte única para as abas que usam este componente. */
export function useFinanceiroAcoesLabels(): Labels {
  const { idioma } = useAdminV2Session()
  const ui = getMessages(idioma).admin_ui
  return {
    faixaAria: ui.financeiro_acoes_aria,
    registrarVenda: ui.financeiro_acao_registrar_venda,
    receber: ui.financeiro_acao_receber,
    pagar: ui.financeiro_acao_pagar,
    transferir: ui.financeiro_acao_transferir,
    vendaTitulo: ui.financeiro_acao_venda_titulo,
    vendaTexto: ui.financeiro_acao_venda_texto,
    vendaPdv: ui.financeiro_acao_venda_pdv,
    vendaBuscar: ui.financeiro_acao_venda_buscar,
    receberTitulo: ui.financeiro_acao_receber_titulo,
    pagarTitulo: ui.financeiro_acao_pagar_titulo,
    transferirTitulo: ui.financeiro_acao_transferir_titulo,
    avulsoHint: ui.financeiro_acao_avulso_hint,
    confirmarReceber: ui.financeiro_acao_confirmar_receber,
    confirmarPagar: ui.financeiro_acao_confirmar_pagar,
    confirmarTransferir: ui.financeiro_acao_confirmar_transferir,
  }
}

export function FinanceiroAcoesRapidas({ data, labels, mostrar, acao: acaoProp, onAcao, foco = null }: Props) {
  const textos = useTextosBaixaForm()
  const [acaoInterna, setAcaoInterna] = useState<FinanceiroAcaoRapida>(null)
  const acao = acaoProp !== undefined ? acaoProp : acaoInterna
  // Só abre operações deste contexto: estado antigo de outra aba não reabre modal aqui.
  const acaoVisivel = acao && mostrar.includes(acao) ? acao : null
  const setAcao = (proximo: FinanceiroAcaoRapida) => (onAcao ? onAcao(proximo) : setAcaoInterna(proximo))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') (onAcao ? onAcao(null) : setAcaoInterna(null))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAcao])

  const abertosReceber = (data?.receber ?? []).filter((t) => !['PAGO', 'QUITADO', 'CANCELADO'].includes(t.status))
  const abertosPagar = (data?.pagar ?? []).filter((t) => !['PAGO', 'QUITADO', 'CANCELADO'].includes(t.status))
  const rotulo = (t: (typeof abertosReceber)[number]) =>
    `${t.nome} · ${t.descricao} · ${formatBRL(t.valor_aberto ?? t.valor_total - (t.valor_pago ?? 0))}`
  const focoReceber = foco?.tipo === 'AR' ? foco : null
  const focoPagar = foco?.tipo === 'AP' ? foco : null
  const opcoesReceber = opcoesComFoco(
    abertosReceber.map((t) => ({ id: t.id, rotulo: rotulo(t) })),
    focoReceber,
    'AR',
    { id: focoReceber?.id ?? '', rotulo: focoReceber?.rotulo ?? '' },
  )
  const opcoesPagar = opcoesComFoco(
    abertosPagar.map((t) => ({ id: t.id, rotulo: rotulo(t) })),
    focoPagar,
    'AP',
    { id: focoPagar?.id ?? '', rotulo: focoPagar?.rotulo ?? '' },
  )

  const botoes: Record<Exclude<FinanceiroAcaoRapida, null>, { texto: string; icone: ReactNode; semDados?: boolean }> = {
    venda: { texto: labels.registrarVenda, icone: <ShoppingCart className="h-5 w-5 shrink-0" aria-hidden /> },
    receber: { texto: labels.receber, icone: <HandCoins className="h-5 w-5 shrink-0" aria-hidden />, semDados: true },
    pagar: { texto: labels.pagar, icone: <Banknote className="h-5 w-5 shrink-0" aria-hidden />, semDados: true },
    transferir: { texto: labels.transferir, icone: <ArrowLeftRight className="h-5 w-5 shrink-0" aria-hidden />, semDados: true },
  }

  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label={labels.faixaAria}>
        {mostrar.map((op) => (
          <button
            key={op}
            type="button"
            className={BTN}
            disabled={botoes[op].semDados && !data}
            onClick={() => setAcao(op)}
          >
            {botoes[op].icone}
            {botoes[op].texto}
          </button>
        ))}
      </div>

      <PainelShell open={acaoVisivel === 'venda'} title={labels.vendaTitulo} onClose={() => setAcao(null)}>
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
          <PainelShell open={acaoVisivel === 'receber'} title={labels.receberTitulo} onClose={() => setAcao(null)}>
            <p className="mb-3 text-small text-jl-fg-3">{labels.avulsoHint}</p>
            <FinanceiroForm key={`receber-${focoReceber?.id ?? 'livre'}`} title={labels.receberTitulo} tipo="BAIXAR_AR" submit={labels.confirmarReceber}>
              <Field name="titulo_id" label={textos.tituloReceber} value={focoReceber?.id ?? ''}>
                <option value="">{textos.selecione}</option>
                {opcoesReceber.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.rotulo}
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

          <PainelShell open={acaoVisivel === 'pagar'} title={labels.pagarTitulo} onClose={() => setAcao(null)}>
            <p className="mb-3 text-small text-jl-fg-3">{labels.avulsoHint}</p>
            <FinanceiroForm key={`pagar-${focoPagar?.id ?? 'livre'}`} title={labels.pagarTitulo} tipo="BAIXAR_AP" submit={labels.confirmarPagar}>
              <Field name="titulo_id" label={textos.tituloPagar} value={focoPagar?.id ?? ''}>
                <option value="">{textos.selecione}</option>
                {opcoesPagar.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.rotulo}
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
            <FinanceiroDespesaForm data={data} />
          </PainelShell>

          <PainelShell open={acaoVisivel === 'transferir'} title={labels.transferirTitulo} onClose={() => setAcao(null)}>
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
