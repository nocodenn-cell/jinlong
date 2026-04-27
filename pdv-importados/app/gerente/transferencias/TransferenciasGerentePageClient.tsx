'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { executarTransferencia, obterEstoqueDisponivelTransferencia } from './actions'

export type TransferenciaLojaRow = { id: string; nome: string; codigo: string }
export type TransferenciaProdutoOpt = { id: string; nome: string }

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
  const [carregandoEstoque, setCarregandoEstoque] = useState(false)

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
      if (r.success) setEstoqueOrigem(r.quantidade)
      else {
        setEstoqueOrigem(null)
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
    }) => {
      const r = await executarTransferencia({
        loja_origem_id: p.loja_origem_id,
        loja_destino_id: p.loja_destino_id,
        produto_id: p.produto_id,
        quantidade: p.quantidade,
        observacao: p.observacao || undefined,
      })
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: 'Transferência concluída.' },
  )

  const inputClass = 'rounded-lg px-3 py-2 text-sm app-input'
  const selectClass = 'rounded-lg px-3 py-2 text-sm app-select'

  const origemIgualDestino = podeTransferir && origemId !== '' && origemId === destinoId
  const qtd = Number(quantidadeStr.replace(',', '.'))
  const qtdValida = Number.isFinite(qtd) && qtd > 0
  const estoqueInsuficiente =
    estoqueOrigem !== null && qtdValida && qtd > estoqueOrigem + 1e-9

  const nomeLoja = useCallback((id: string) => lojas.find((l) => l.id === id)?.nome ?? '—', [lojas])
  const nomeProduto = useMemo(() => produtos.find((p) => p.id === produtoId)?.nome ?? '—', [produtos, produtoId])

  const podeEnviar =
    podeTransferir &&
    !origemIgualDestino &&
    qtdValida &&
    !estoqueInsuficiente &&
    produtoId !== '' &&
    !carregandoEstoque

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!podeTransferir) return
    if (origemIgualDestino) {
      emitGerenteToast({ kind: 'error', message: t.bloqueio_origem_destino })
      return
    }
    if (!qtdValida) {
      emitGerenteToast({ kind: 'error', message: 'Quantidade inválida.' })
      return
    }
    if (estoqueInsuficiente) {
      emitGerenteToast({ kind: 'error', message: t.estoque_insuficiente })
      return
    }
    void mutate({
      loja_origem_id: origemId,
      loja_destino_id: destinoId,
      produto_id: produtoId,
      quantidade: qtd,
      observacao: observacao.trim(),
    })
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
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
            <span className="gerente-fin-label text-xs font-medium">{t.resumo_origem}</span>
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
          </label>
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-xs font-medium">{t.resumo_destino}</span>
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
          </label>
          {origemIgualDestino ? (
            <p className="rounded-lg border px-3 py-2 text-sm app-badge-danger md:col-span-2" role="alert">
              {t.bloqueio_origem_destino}
            </p>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="gerente-fin-label text-xs font-medium">{t.resumo_produto}</span>
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
            <span className="gerente-fin-label text-xs font-medium">{t.resumo_quantidade}</span>
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
                {estoqueOrigem.toLocaleString(
                  idioma === 'pt' ? 'pt-BR' : idioma === 'zh-HK' ? 'zh-HK' : 'zh-CN',
                )}
              </span>
            ) : (
              <span className="app-muted">—</span>
            )}
            {estoqueInsuficiente ? (
              <span className="mt-1 block text-xs font-medium">{t.estoque_insuficiente}</span>
            ) : null}
          </div>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="gerente-fin-label text-xs font-medium">{t.resumo_obs}</span>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={inputClass} />
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
                <span className="tabular-nums font-medium">{qtdValida ? qtd : '—'}</span>
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
            {loading ? t.btn_transferindo : t.btn_transferir}
          </button>
        </form>
      ) : null}
    </div>
  )
}
