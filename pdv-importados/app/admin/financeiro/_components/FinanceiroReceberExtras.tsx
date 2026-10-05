'use client'

import Link from 'next/link'
import type { FinanceiroPainel } from '../financeiroLojaTypes'
import { executarFinanceiroLoja } from '../financeiroLojaActions'
import { CategoriaOptions } from './FinanceiroOptions'
import { useRouter } from 'next/navigation'
import { Fragment, useState, useTransition } from 'react'
import { ROUTES } from '@/lib/navigation/routes'
import { formatBRL } from '@/lib/format/money'
import { labelFormaPagamentoVenda } from '@/lib/format/vendaLabels'
import { getMessages } from '@/i18n/getMessages'
import { useAdminV2Session } from '@/components/ui/admin-v2/AdminV2SessionContext'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/forms'
import {
  criarTituloReceber,
  estornarLiquidacaoReceber,
  liquidarTitulo,
  listarLiquidacoesReceber,
} from '@/app/gerente/financeiro/actions'
import type { ReceivableLiquidacaoRow } from '@shared-core/src/financial'
import type { ContaLinha } from './ContasReceberTable'

type ClienteOpt = { id: string; nome: string }

type Props = {
  financeiroData?: FinanceiroPainel
  contas: ContaLinha[]
  clientesIniciais: ClienteOpt[]
  caixasAbertos: Array<{ id: string; loja_id: string; operador: string }>
  /** Loja do ator autenticado — `registrar_liquidacao_receber` rejeita liquidação cross-loja para todos os perfis. */
  actorLojaId: string | null
}

const FORMAS = ['DINHEIRO'] as const

const LINK_MUTED =
  'text-caption font-medium text-[var(--color-warning-strong)] hover:underline'

export function FinanceiroReceberExtras({ financeiroData, contas, clientesIniciais, caixasAbertos, actorLojaId }: Props) {
  const router = useRouter()
  const { idioma } = useAdminV2Session()
  const m = getMessages(idioma)
  const [pending, startTransition] = useTransition()
  const [formasPorTitulo, setFormasPorTitulo] = useState<Record<string, (typeof FORMAS)[number]>>({})
  const [historicoAbertoId, setHistoricoAbertoId] = useState<string | null>(null)
  const [historicoPorTitulo, setHistoricoPorTitulo] = useState<Record<string, ReceivableLiquidacaoRow[]>>({})
  const [carregandoHistoricoId, setCarregandoHistoricoId] = useState<string | null>(null)
  const [estornoAlvo, setEstornoAlvo] = useState<{ tituloId: string; liquidacaoId: string } | null>(null)
  const [motivoEstorno, setMotivoEstorno] = useState('')
  const [erroMotivoEstorno, setErroMotivoEstorno] = useState<string | null>(null)

  function refresh() {
    router.refresh()
  }

  function handleToggleHistorico(tituloId: string) {
    if (historicoAbertoId === tituloId) {
      setHistoricoAbertoId(null)
      return
    }
    setHistoricoAbertoId(tituloId)
    if (historicoPorTitulo[tituloId]) return
    setCarregandoHistoricoId(tituloId)
    startTransition(async () => {
      const r = await listarLiquidacoesReceber(tituloId)
      setCarregandoHistoricoId(null)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setHistoricoPorTitulo((atual) => ({ ...atual, [tituloId]: r.data }))
    })
  }

  function handleEstornar(tituloId: string, liquidacaoId: string) {
    setEstornoAlvo({ tituloId, liquidacaoId })
    setMotivoEstorno('')
    setErroMotivoEstorno(null)
  }

  function confirmarEstornar() {
    if (!estornoAlvo) return
    const motivo = motivoEstorno.trim()
    if (motivo.length < 2) {
      setErroMotivoEstorno('Motivo deve ter ao menos 2 caracteres.')
      return
    }
    const { tituloId, liquidacaoId } = estornoAlvo
    startTransition(async () => {
      const r = await estornarLiquidacaoReceber({
        liquidacao_id: liquidacaoId,
        motivo,
        idempotency_key: crypto.randomUUID(),
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: 'Liquidação estornada.' })
      const atualizado = await listarLiquidacoesReceber(tituloId)
      if (atualizado.success) {
        setHistoricoPorTitulo((atual) => ({ ...atual, [tituloId]: atualizado.data }))
      }
      setEstornoAlvo(null)
      refresh()
    })
  }

  function handleLiquidar(tituloId: string, form: HTMLFormElement) {
    const fd = new FormData(form)
    const valor = Number(fd.get('valor'))
    const forma = 'DINHEIRO'
    const caixaId = String(fd.get('caixa_id') ?? '') || null
    const idempotencyKey = form.dataset.idempotencyKey || crypto.randomUUID()
    form.dataset.idempotencyKey = idempotencyKey
    if (!Number.isFinite(valor) || valor <= 0) {
      emitGerenteToast({ kind: 'error', message: 'Informe um valor válido.' })
      return
    }
    startTransition(async () => {
      const r = await liquidarTitulo({
        titulo_id: tituloId,
        valor,
        forma_pagamento: forma,
        caixa_id: forma === 'DINHEIRO' ? caixaId : null,
        idempotency_key: idempotencyKey,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      delete form.dataset.idempotencyKey
      emitGerenteToast({ kind: 'success', message: 'Liquidação registrada.' })
      refresh()
    })
  }

  function handleNovoTitulo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const valor = Number(fd.get('valor_total'))
    startTransition(async () => {
      const dados = { cliente_id:String(fd.get('cliente_id')),valor: String(fd.get('valor_total')),data:String(fd.get('vencimento')),categoria_id:String(fd.get('categoria_id')),descricao:String(fd.get('descricao')) }
      const serialized = JSON.stringify(dados)
      const requestId = form.dataset.payload === serialized && form.dataset.requestId ? form.dataset.requestId : crypto.randomUUID()
      form.dataset.requestId = requestId
      form.dataset.payload = serialized
      const novo = financeiroData ? await executarFinanceiroLoja({ tipo: 'CRIAR_AR', requestId, dados }) : null
      const r = novo ? (novo.ok ? { success:true as const } : { success:false as const, error:novo.error }) : await criarTituloReceber({
        cliente_id: String(fd.get('cliente_id') ?? ''),
        valor_total: valor,
        descricao: String(fd.get('descricao') ?? '') || undefined,
        vencimento: String(fd.get('vencimento') ?? '') || undefined,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: 'Título criado.' })
      delete form.dataset.requestId
      delete form.dataset.payload
      form.reset()
      refresh()
    })
  }

  const abertas = contas.filter((c) => c.valor_aberto > 0)

  return (
    <Fragment>
    <div className="admin-v2-stack mt-4">
      {abertas.length > 0 ? (
        <div className="rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft p-3">
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-jl-fg-3">
            Liquidar título
          </h3>
          <p className="mb-2 text-caption text-jl-fg-3">
            Este formulário recebe dinheiro no caixa físico. Para PIX, cartão ou transferência, use{' '}
            <a href="#baixa-conta-financeira" className={LINK_MUTED}>Receber na conta financeira</a>{' '}
            e selecione a conta de destino.
          </p>
          <ul className="space-y-2">
            {abertas.slice(0, 8).map((c) => {
              const caixasTitulo = caixasAbertos.filter((caixa) => caixa.loja_id === c.loja_id)
              const foraDaLoja = actorLojaId != null && c.loja_id !== actorLojaId
              return (
              <Fragment key={c.id}>
              <li
                className="flex flex-col gap-2 rounded-md border border-[var(--color-border-secondary)] bg-jl-surface-base p-2"
              >
                {/* Linha 1: identifica o título (cliente + em aberto) antes dos controles. */}
                <div className="flex min-w-0 items-baseline gap-2 text-small">
                  <span className="min-w-0 flex-1 truncate font-medium text-jl-fg-1" title={c.cliente_nome}>
                    {c.cliente_nome}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-jl-fg-3">{formatBRL(c.valor_aberto)} em aberto</span>
                  {!foraDaLoja ? (
                    <button
                      type="button"
                      onClick={() => handleToggleHistorico(c.id)}
                      className="shrink-0 whitespace-nowrap text-caption font-medium text-[var(--color-warning-strong)] hover:underline"
                    >
                      {historicoAbertoId === c.id ? 'Ocultar histórico' : 'Histórico'}
                    </button>
                  ) : null}
                </div>
                {foraDaLoja ? (
                  // registrar_liquidacao_receber rejeita liquidação cross-loja para todos
                  // os perfis — sem formulário em vez de deixar o envio falhar sempre.
                  <span
                    className="text-caption text-jl-fg-3"
                    title="Título de outra loja — liquidação deve ser feita por um ator daquela loja."
                  >
                    Outra loja
                  </span>
                ) : (
                <form
                  className="flex flex-wrap items-center gap-1.5"
                  onChange={(e) => {
                    delete e.currentTarget.dataset.idempotencyKey
                  }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleLiquidar(c.id, e.currentTarget)
                  }}
                >
                  <input
                    name="valor"
                    type="number"
                    min={0.01}
                    step="0.01"
                    defaultValue={c.valor_aberto}
                    className="fp-control fp-control--sm w-24 text-right text-small"
                    aria-label="Valor a liquidar"
                  />
                  <select
                    name="forma"
                    className="fp-control fp-control--sm text-small"
                    defaultValue="DINHEIRO"
                    aria-label="Forma de pagamento"
                    onChange={(e) => {
                      setFormasPorTitulo((atual) => ({ ...atual, [c.id]: e.target.value as (typeof FORMAS)[number] }))
                    }}
                  >
                    {FORMAS.map((f) => (
                      <option key={f} value={f}>
                        {labelFormaPagamentoVenda(f, m)}
                      </option>
                    ))}
                  </select>
                  {caixasTitulo.length > 1 && (formasPorTitulo[c.id] ?? 'DINHEIRO') === 'DINHEIRO' ? (
                    <select name="caixa_id" required className="fp-control fp-control--sm text-small" aria-label="Caixa físico">
                      <option value="">Selecione o caixa</option>
                      {caixasTitulo.map((caixa) => <option key={caixa.id} value={caixa.id}>{caixa.operador}</option>)}
                    </select>
                  ) : null}
                  <button type="submit" disabled={pending} className="admin-v2-btn-secondary text-small">
                    Liquidar
                  </button>
                </form>
                )}
              </li>
              {!foraDaLoja && historicoAbertoId === c.id ? (
                <li className="rounded-md border border-dashed border-[var(--color-border-secondary)] bg-jl-surface-soft p-2 text-caption">
                  {carregandoHistoricoId === c.id ? (
                    <span className="text-jl-fg-3">Carregando histórico…</span>
                  ) : (historicoPorTitulo[c.id]?.length ?? 0) === 0 ? (
                    <span className="text-jl-fg-3">Nenhuma liquidação registrada para este título.</span>
                  ) : (
                    <ul className="space-y-1">
                      {historicoPorTitulo[c.id]!.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className={l.operacaoTipo === 'ESTORNO' ? 'text-jl-fg-3 line-through' : 'text-jl-fg-1'}>
                            {formatBRL(l.valor)} · {labelFormaPagamentoVenda(l.formaPagamento, m)} ·{' '}
                            {new Date(l.createdAt).toLocaleString('pt-BR')}
                            {l.operacaoTipo === 'ESTORNO' ? ' (estorno)' : ''}
                          </span>
                          {l.operacaoTipo !== 'ESTORNO' ? (
                            <button
                              type="button"
                              onClick={() => handleEstornar(c.id, l.id)}
                              className="text-caption font-medium text-[var(--color-danger-strong)] hover:underline"
                            >
                              Estornar
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ) : null}
              </Fragment>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-jl-fg-3">
            Novo título a receber
          </h3>
          <Link href={ROUTES.admin.clientes} className={LINK_MUTED}>
            Gerenciar clientes
          </Link>
        </div>
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={handleNovoTitulo}>
          <select name="cliente_id" required className="fp-control text-small sm:col-span-2">
            <option value="">Selecione o cliente</option>
            {clientesIniciais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <input
            name="valor_total"
            type="number"
            min={0.01}
            step="0.01"
            required
            placeholder="Valor total"
            className="fp-control text-small"
          />
          <input name="vencimento" type="date" required={!!financeiroData} aria-label="Vencimento" className="fp-control text-small" />
          {financeiroData ? <select name="categoria_id" required className="fp-control text-small" aria-label="Categoria"><CategoriaOptions data={financeiroData} tipo="RECEITA" /></select> : null}
          <input
            name="descricao"
            type="text"
            placeholder="Descrição (opcional)"
            className="fp-control text-small sm:col-span-2"
          />
          <button
            type="submit"
            disabled={pending || clientesIniciais.length === 0}
            className="admin-v2-btn-primary text-small sm:col-span-2 sm:justify-self-end"
          >
            Criar título
          </button>
        </form>
        {clientesIniciais.length === 0 ? (
          <p className="mt-2 text-caption text-jl-fg-3">
            Cadastre um cliente em{' '}
            <Link href={ROUTES.admin.clientes} className={LINK_MUTED}>
              Clientes
            </Link>{' '}
            antes de lançar títulos.
          </p>
        ) : null}
      </div>
    </div>

    {estornoAlvo ? (
      <DragonModal
        open
        onClose={() => setEstornoAlvo(null)}
        variant="danger"
        size="sm"
        title="Estornar liquidação"
        dismissable={!pending}
        closeLabel="Fechar"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEstornoAlvo(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" onClick={confirmarEstornar} disabled={pending}>
              {pending ? '…' : 'Estornar'}
            </Button>
          </>
        }
      >
        <label htmlFor="motivo-estorno" className="mb-1 block text-xs font-medium text-jl-fg-3">
          Motivo do estorno<span className="ml-0.5 text-[color:var(--accent)]">*</span>
        </label>
        <Input
          id="motivo-estorno"
          value={motivoEstorno}
          onChange={(e) => {
            setMotivoEstorno(e.target.value)
            if (erroMotivoEstorno) setErroMotivoEstorno(null)
          }}
          aria-invalid={!!erroMotivoEstorno}
          disabled={pending}
          autoFocus
        />
        {erroMotivoEstorno ? (
          <span className="mt-1 block text-xs text-[var(--color-danger-strong)]">{erroMotivoEstorno}</span>
        ) : null}
      </DragonModal>
    ) : null}
    </Fragment>
  )
}
