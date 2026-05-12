'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { transferenciaActionResultToLegacy } from '@/lib/observability/actionResultAdapters'
import { executarTransferencia, obterEstoqueDisponivelTransferencia } from './actions'
import { caixaFmt } from '@/app/caixa/caixaI18n'

export type TransferenciaLojaRow = { id: string; nome: string; codigo: string }
export type TransferenciaProdutoOpt = {
  id: string
  nome: string
  unidade_medida: string
  limite_transferencia_sem_observacao: number | null
}

type Props = Readonly<{
  idioma: Idioma
  lojas: TransferenciaLojaRow[]
  produtos: TransferenciaProdutoOpt[]
}>

export function TransferenciasGerentePageClient({ idioma, lojas, produtos }: Props) {
  const m = getMessages(idioma)
  const t = m.gerente.transferencias_page
  const router = useRouter()
  const refetch = useCallback(() => router.refresh(), [router])

  const podeTransferir = lojas.length >= 2
  const [origemId, setOrigemId] = useState(() => (lojas[0]?.id ?? '') as string)
  const [destinoId, setDestinoId] = useState(() => (lojas[1]?.id ?? lojas[0]?.id ?? '') as string)
  const [produtoId, setProdutoId] = useState(() => produtos[0]?.id ?? '')
  const [quantidadeStr, setQuantidadeStr] = useState('')
  const [observacao, setObservacao] = useState('')
  const [estoqueOrigem, setEstoqueOrigem] = useState<number | null>(null)
  const [unidadeMedida, setUnidadeMedida] = useState('UN')
  const [limiteObs, setLimiteObs] = useState(50)
  const [carregandoEstoque, setCarregandoEstoque] = useState(false)
  const [confirmacaoPendente, setConfirmacaoPendente] = useState<
    null | { tipo: 'trocar' } | { tipo: 'transferir'; quantidade: number }
  >(null)
  const idempotencyRef = useRef<string>(crypto.randomUUID())

  useEffect(() => {
    if (!podeTransferir) return
    if (!origemId || !produtoId) {
      setEstoqueOrigem(null)
      return
    }
    let cancel = false
    setCarregandoEstoque(true)
    void (async () => {
      const r = await obterEstoqueDisponivelTransferencia(origemId, produtoId)
      if (cancel) return
      setCarregandoEstoque(false)
      if (r.success) {
        setEstoqueOrigem(r.quantidadeDisponivel)
        setUnidadeMedida(r.unidadeMedida)
        setLimiteObs(r.limiteObservacao)
      }
      else {
        setEstoqueOrigem(null)
        setUnidadeMedida('UN')
        setLimiteObs(50)
        emitGerenteToast({ kind: 'error', message: r.error })
      }
    })()
    return () => {
      cancel = true
    }
  }, [origemId, produtoId, podeTransferir])

  const { mutate, loading } = useGerenteMutation(
    async (p: {
      loja_origem_id: string
      loja_destino_id: string
      produto_id: string
      quantidade: number
      observacao: string
      idempotency_key: string
    }) => {
      const raw = await executarTransferencia({
        loja_origem_id: p.loja_origem_id,
        loja_destino_id: p.loja_destino_id,
        produto_id: p.produto_id,
        quantidade: p.quantidade,
        observacao: p.observacao || undefined,
        idempotency_key: p.idempotency_key,
      })
      const r = transferenciaActionResultToLegacy(raw)
      if (!r.success) throw new Error(r.error)
      refetch()
      return r
    },
    {
      onSuccess: (result) => {
        emitGerenteToast({ kind: 'success', message: `Transferência concluída. ID: ${result.transferenciaId}` })
        idempotencyRef.current = crypto.randomUUID()
      },
    },
  )

  const inputClass = 'rounded-lg px-3 py-2 text-sm app-input'
  const selectClass = 'rounded-lg px-3 py-2 text-sm app-select'

  const origemIgualDestino = podeTransferir && origemId !== '' && origemId === destinoId
  const qtd = Number(quantidadeStr.replace(',', '.'))
  const qtdValida = Number.isFinite(qtd) && qtd > 0
  const estoqueInsuficiente =
    estoqueOrigem !== null && qtdValida && qtd > estoqueOrigem + 1e-9
  const observacaoObrigatoria = qtdValida && qtd > limiteObs && observacao.trim().length === 0

  const nomeLoja = useCallback((id: string) => lojas.find((l) => l.id === id)?.nome ?? '—', [lojas])
  const produtoSelecionado = useMemo(
    () => produtos.find((p) => p.id === produtoId) ?? null,
    [produtos, produtoId],
  )
  const nomeProduto = produtoSelecionado?.nome ?? '—'
  const saldoProjetado =
    estoqueOrigem !== null && qtdValida ? Math.max(0, estoqueOrigem - qtd) : null

  const podeEnviar =
    podeTransferir &&
    !origemIgualDestino &&
    qtdValida &&
    !estoqueInsuficiente &&
    !observacaoObrigatoria &&
    produtoId !== '' &&
    !carregandoEstoque

  const executarTrocaOrigemDestino = useCallback(() => {
    setOrigemId(destinoId)
    setDestinoId(origemId)
    setConfirmacaoPendente(null)
  }, [destinoId, origemId])

  const executarTransferenciaConfirmada = useCallback(
    (quantidade: number) => {
      void mutate({
        loja_origem_id: origemId,
        loja_destino_id: destinoId,
        produto_id: produtoId,
        quantidade,
        observacao: observacao.trim(),
        idempotency_key: idempotencyRef.current,
      })
      setConfirmacaoPendente(null)
    },
    [destinoId, mutate, observacao, origemId, produtoId],
  )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!podeTransferir) return
    if (origemIgualDestino) {
      emitGerenteToast({ kind: 'error', message: t.bloqueio_origem_destino })
      return
    }
    if (!qtdValida) {
      emitGerenteToast({ kind: 'error', message: t.qtd_invalida })
      return
    }
    if (estoqueInsuficiente) {
      emitGerenteToast({
        kind: 'error',
        message: `Saldo insuficiente na origem. Disponível: ${Number(estoqueOrigem ?? 0).toFixed(3)}, solicitado: ${qtd.toFixed(3)}.`,
      })
      return
    }
    if (observacaoObrigatoria) {
      emitGerenteToast({
        kind: 'error',
        message: `Observação obrigatória para transferências acima de ${limiteObs.toFixed(3)} ${unidadeMedida}.`,
      })
      return
    }
    setConfirmacaoPendente({ tipo: 'transferir', quantidade: qtd })
  }

  return (
    <div className={`mx-auto max-w-xl px-4 py-6 sm:px-6 ${idioma === 'pt' ? '' : 'font-chinese'}`}>
      <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline">
        ← {m.gerente.inicio}
      </Link>
      <h1 className="gerente-fin-page-title mt-4 text-2xl font-semibold tracking-tight">{m.gerente.nav_transferencias}</h1>
      <p className="gerente-fin-muted mt-2 text-sm leading-relaxed">{t.intro}</p>

      {!podeTransferir ? (
        <div className="mt-6 rounded-xl border p-4 text-sm leading-relaxed app-badge-warn" role="status">
          <strong>{t.uma_loja_aviso_titulo}</strong> {t.uma_loja_aviso_texto}
        </div>
      ) : null}

      {podeTransferir ? (
        <form onSubmit={onSubmit} className="dragon-glass-card mt-6 grid grid-cols-1 gap-3 rounded-xl p-5 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-sm font-medium">{t.resumo_origem}</span>
            <select
              name="origem"
              required
              value={origemId}
              onChange={(e) => setOrigemId(e.target.value)}
              className={selectClass}
            >
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.codigo})
                </option>
              ))}
            </select>
            <span className="inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground border border-border">
              {t.resumo_origem}: {nomeLoja(origemId)}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-sm font-medium">{t.resumo_destino}</span>
            <select
              name="destino"
              required
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              className={selectClass}
            >
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.codigo})
                </option>
              ))}
            </select>
            <span className="inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary border border-primary/30">
              {t.resumo_destino}: {nomeLoja(destinoId)}
            </span>
          </label>
          <div className="md:col-span-2 -mt-1">
            <button
              type="button"
              className="text-xs font-medium app-link-accent underline-offset-4 hover:underline"
              onClick={() => {
                if (produtoId) {
                  setConfirmacaoPendente({ tipo: 'trocar' })
                  return
                }
                setOrigemId(destinoId)
                setDestinoId(origemId)
              }}
            >
              {t.btn_trocar_origem_destino}
            </button>
          </div>
          {origemIgualDestino ? (
            <p className="rounded-lg border px-3 py-2 text-sm app-badge-danger md:col-span-2" role="alert">
              {t.bloqueio_origem_destino}
            </p>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-sm font-medium">{t.resumo_produto}</span>
            <select
              name="produto_id"
              required
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
              className={selectClass}
            >
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-sm font-medium">{t.resumo_quantidade}</span>
            <input
              name="quantidade"
              type="number"
              min={0.001}
              step="0.001"
              required
              value={quantidadeStr}
              onChange={(e) => setQuantidadeStr(e.target.value)}
              className={inputClass}
            />
          </label>
          <div
            className={`rounded-lg border px-3 py-2 text-sm md:col-span-2 ${
              estoqueInsuficiente ? 'app-badge-danger' : 'app-surface-soft app-border'
            }`}
            role="status"
          >
            <span className="font-medium">{t.estoque_disponivel}: </span>
            {carregandoEstoque ? (
              <span className="app-muted">{t.estoque_carregando}</span>
            ) : estoqueOrigem !== null ? (
              <span className="tabular-nums font-semibold">
                {(() => {
                  const localeString = idioma === 'pt' ? 'pt-BR' : 'zh-CN'
                    return estoqueOrigem.toLocaleString(localeString)
                })()}
              </span>
            ) : (
              <span className="app-muted">—</span>
            )}
            <span className="ml-2 text-xs app-muted">({unidadeMedida})</span>
            {estoqueInsuficiente ? (
              <span className="mt-1 block text-xs font-medium">{t.estoque_insuficiente}</span>
            ) : null}
          </div>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="gerente-fin-label text-sm font-medium">{t.resumo_obs}</span>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={inputClass} />
            {observacaoObrigatoria ? (
              <span className="text-xs app-badge-warn rounded-md border px-2 py-1 mt-1">
                {t.obs_obrigatoria_limite}
              </span>
            ) : null}
          </label>

          <div className="rounded-lg border p-3 md:col-span-2 app-surface-soft app-border">
            <div className="text-xs font-semibold uppercase tracking-wide app-muted">{t.resumo_titulo}</div>
            <ul className="mt-2 space-y-1 text-sm">
              <li>
                <span className="app-muted">{t.resumo_origem}:</span> {nomeLoja(origemId)}
              </li>
              <li>
                <span className="app-muted">{t.resumo_destino}:</span> {nomeLoja(destinoId)}
              </li>
              <li>
                <span className="app-muted">{t.resumo_produto}:</span> {nomeProduto}
              </li>
              <li>
                <span className="app-muted">{t.resumo_quantidade}:</span>{' '}
                <span className="tabular-nums font-medium">{qtdValida ? qtd : '—'} {unidadeMedida}</span>
              </li>
              <li>
                <span className="app-muted">{t.saldo_atual_origem}:</span>{' '}
                <span className="tabular-nums font-medium">
                  {estoqueOrigem !== null ? estoqueOrigem : '—'} {unidadeMedida}
                </span>
              </li>
              <li>
                <span className="app-muted">{t.saldo_projetado_origem}:</span>{' '}
                <span className="tabular-nums font-medium">
                  {saldoProjetado !== null ? saldoProjetado : '—'} {unidadeMedida}
                </span>
              </li>
              <li>
                <span className="app-muted">{t.resumo_obs}:</span>{' '}
                {observacao.trim() ? observacao.trim() : t.resumo_nenhuma_obs}
              </li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading || !podeEnviar}
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold shadow-md transition-[filter] disabled:cursor-not-allowed disabled:opacity-70 md:col-span-2 md:w-auto md:justify-self-end md:min-w-[160px] app-btn-accent"
          >
            {loading ? t.btn_processando : t.btn_transferir}
          </button>
        </form>
      ) : null}
      <TransferenciaConfirmModal
        open={confirmacaoPendente !== null}
        title={
          confirmacaoPendente?.tipo === 'trocar'
            ? t.modal_trocar_titulo
            : t.modal_confirmar_titulo
        }
        description={
          confirmacaoPendente?.tipo === 'trocar'
            ? t.modal_trocar_descricao
            : caixaFmt(t.modal_confirmar_descricao, {
                quantidade: String(confirmacaoPendente?.quantidade ?? '—'),
                unidade: unidadeMedida,
                produto: nomeProduto,
                origem: nomeLoja(origemId),
                destino: nomeLoja(destinoId),
              })
        }
        processing={loading}
        processandoLabel={t.btn_processando}
        confirmarLabel={m.comum.confirmar}
        cancelarLabel={m.comum.cancelar}
        onOpenChange={(open) => {
          if (!open) setConfirmacaoPendente(null)
        }}
        onConfirm={() => {
          if (!confirmacaoPendente) return
          if (confirmacaoPendente.tipo === 'trocar') {
            executarTrocaOrigemDestino()
            return
          }
          executarTransferenciaConfirmada(confirmacaoPendente.quantidade)
        }}
      />
    </div>
  )
}

function TransferenciaConfirmModal({
  open,
  title,
  description,
  processing,
  processandoLabel,
  confirmarLabel,
  cancelarLabel,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  processing: boolean
  processandoLabel: string
  confirmarLabel: string
  cancelarLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 dragon-glass-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        className="dragon-glass-card app-border w-full sm:max-w-md rounded-none sm:rounded-lg border app-surface-text shadow-xl max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-2 pt-4 px-4 sm:px-6 sm:pt-6">
          <CardTitle className="text-lg app-surface-text">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <p className="text-sm app-muted">{description}</p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 justify-end px-4 sm:px-6 pb-4 sm:pb-6 pt-0 border-t app-divider mt-3 pt-3">
          <Button
            type="button"
            variant="ghost"
            className="app-btn-neutral"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            {cancelarLabel}
          </Button>
          <Button
            type="button"
            className="app-btn-accent"
            onClick={onConfirm}
            disabled={processing}
          >
            {processing ? processandoLabel : confirmarLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
