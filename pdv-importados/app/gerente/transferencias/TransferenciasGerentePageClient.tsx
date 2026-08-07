'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { emitToast } from '@/lib/gerente/toast'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { Button } from '@/components/ui/button'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { DragonModal } from '@/components/ui/DragonModal'
import { EntityLookup, Field, Input, Select } from '@/components/ui/forms'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import { transferenciaActionResultToLegacy } from '@/lib/observability/actionResultAdapters'
import { executarTransferencia, obterEstoqueDisponivelTransferencia } from './actions'
import { caixaFmt } from '@/app/caixa/caixaI18n'
import { ROUTES } from '@shared-core/navigation/routes'

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
        emitToast({ kind: 'error', message: r.error })
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
        emitToast({ kind: 'success', message: `Transferência concluída. ID: ${result.transferenciaId}` })
        idempotencyRef.current = crypto.randomUUID()
      },
    },
  )

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
      emitToast({ kind: 'error', message: t.bloqueio_origem_destino })
      return
    }
    if (!qtdValida) {
      emitToast({ kind: 'error', message: t.qtd_invalida })
      return
    }
    if (estoqueInsuficiente) {
      emitToast({
        kind: 'error',
        message: `Saldo insuficiente na origem. Disponível: ${Number(estoqueOrigem ?? 0).toFixed(3)}, solicitado: ${qtd.toFixed(3)}.`,
      })
      return
    }
    if (observacaoObrigatoria) {
      emitToast({
        kind: 'error',
        message: `Observação obrigatória para transferências acima de ${limiteObs.toFixed(3)} ${unidadeMedida}.`,
      })
      return
    }
    setConfirmacaoPendente({ tipo: 'transferir', quantidade: qtd })
  }

  const modalTitulo =
    confirmacaoPendente?.tipo === 'trocar' ? t.modal_trocar_titulo : t.modal_confirmar_titulo
  const modalDescricao =
    confirmacaoPendente?.tipo === 'trocar'
      ? t.modal_trocar_descricao
      : caixaFmt(t.modal_confirmar_descricao, {
          quantidade: String(confirmacaoPendente?.quantidade ?? '—'),
          unidade: unidadeMedida,
          produto: nomeProduto,
          origem: nomeLoja(origemId),
          destino: nomeLoja(destinoId),
        })

  return (
    <div className={`admin-v2-page ${idioma === 'pt' ? '' : 'font-chinese'}`}>
      <PageHeader title={m.gerente.nav_transferencias} subtitle={t.intro} />

      <Link href={ROUTES.admin.estoque} className="gerente-nav-back text-sm font-medium hover:underline">
        ← {m.gerente.inicio}
      </Link>

      {!podeTransferir ? (
        <div
          className="mt-6 rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-4 text-body leading-relaxed text-[var(--color-warning-strong)]"
          role="status"
        >
          <strong>{t.uma_loja_aviso_titulo}</strong> {t.uma_loja_aviso_texto}
        </div>
      ) : null}

      {podeTransferir ? (
        <SectionCard className="mt-6">
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field id="transferencia-origem" label={t.resumo_origem} required>
              <Select
                name="origem"
                required
                value={origemId}
                onChange={(e) => setOrigemId(e.target.value)}
              >
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome} ({l.codigo})
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="transferencia-destino" label={t.resumo_destino} required>
              <Select
                name="destino"
                required
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
              >
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome} ({l.codigo})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <span className="inline-flex w-fit rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-0.5 text-caption font-semibold text-fg-muted">
                {t.resumo_origem}: {nomeLoja(origemId)}
              </span>
              <span className="inline-flex w-fit rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-2 py-0.5 text-caption font-semibold text-[var(--color-warning-strong)]">
                {t.resumo_destino}: {nomeLoja(destinoId)}
              </span>
            </div>
            <div className="md:col-span-2 -mt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 text-caption underline-offset-4 hover:underline"
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
              </Button>
            </div>
            {origemIgualDestino ? (
              <p
                className="rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-body text-[var(--color-danger-strong)] md:col-span-2"
                role="alert"
              >
                {t.bloqueio_origem_destino}
              </p>
            ) : null}
            <Field id="transferencia-produto" label={t.resumo_produto} required>
              <div>
                <input type="hidden" name="produto_id" value={produtoId} readOnly />
                <EntityLookup
                  value={produtoId || null}
                  selectedLabel={produtoSelecionado?.nome}
                  aria-label={t.resumo_produto}
                  onSelect={(opt) => setProdutoId(opt?.value ?? '')}
                  onSearch={async (query) => {
                    const q = query.trim().toLowerCase()
                    return produtos
                      .filter((p) => p.nome.toLowerCase().includes(q))
                      .slice(0, 40)
                      .map((p) => ({
                        value: p.id,
                        label: p.nome,
                        description: p.unidade_medida,
                      }))
                  }}
                  minChars={1}
                  debounceMs={200}
                  emptyLabel="Nenhum produto"
                />
              </div>
            </Field>
            <Field id="transferencia-quantidade" label={t.resumo_quantidade} required>
              <Input
                name="quantidade"
                type="number"
                min={0.001}
                step="0.001"
                required
                value={quantidadeStr}
                onChange={(e) => setQuantidadeStr(e.target.value)}
              />
            </Field>
            <div
              className={`rounded-lg border px-3 py-2 text-body md:col-span-2 ${
                estoqueInsuficiente
                  ? 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-soft)] text-fg'
              }`}
              role="status"
            >
              <span className="font-medium">{t.estoque_disponivel}: </span>
              {carregandoEstoque ? (
                <span className="text-fg-muted">{t.estoque_carregando}</span>
              ) : estoqueOrigem !== null ? (
                <span className="tabular-nums font-semibold">
                  {estoqueOrigem.toLocaleString(idioma === 'pt' ? 'pt-BR' : 'zh-CN')}
                </span>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
              <span className="ml-2 text-caption text-fg-muted">({unidadeMedida})</span>
              {estoqueInsuficiente ? (
                <span className="mt-1 block text-caption font-medium">{t.estoque_insuficiente}</span>
              ) : null}
            </div>
            <Field
              id="transferencia-obs"
              label={t.resumo_obs}
              className="md:col-span-2"
              error={observacaoObrigatoria ? t.obs_obrigatoria_limite : undefined}
            >
              <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </Field>

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 md:col-span-2">
              <div className="text-caption font-semibold uppercase tracking-wide text-fg-muted">
                {t.resumo_titulo}
              </div>
              <ul className="mt-2 space-y-1 text-body">
                <li>
                  <span className="text-fg-muted">{t.resumo_origem}:</span> {nomeLoja(origemId)}
                </li>
                <li>
                  <span className="text-fg-muted">{t.resumo_destino}:</span> {nomeLoja(destinoId)}
                </li>
                <li>
                  <span className="text-fg-muted">{t.resumo_produto}:</span> {nomeProduto}
                </li>
                <li>
                  <span className="text-fg-muted">{t.resumo_quantidade}:</span>{' '}
                  <span className="tabular-nums font-medium">
                    {qtdValida ? qtd : '—'} {unidadeMedida}
                  </span>
                </li>
                <li>
                  <span className="text-fg-muted">{t.saldo_atual_origem}:</span>{' '}
                  <span className="tabular-nums font-medium">
                    {estoqueOrigem !== null ? estoqueOrigem : '—'} {unidadeMedida}
                  </span>
                </li>
                <li>
                  <span className="text-fg-muted">{t.saldo_projetado_origem}:</span>{' '}
                  <span className="tabular-nums font-medium">
                    {saldoProjetado !== null ? saldoProjetado : '—'} {unidadeMedida}
                  </span>
                </li>
                <li>
                  <span className="text-fg-muted">{t.resumo_obs}:</span>{' '}
                  {observacao.trim() ? observacao.trim() : t.resumo_nenhuma_obs}
                </li>
              </ul>
            </div>

            <div className="mt-2 flex justify-end md:col-span-2">
              <Button type="submit" variant="primary" loading={loading} disabled={!podeEnviar}>
                {loading ? t.btn_processando : t.btn_transferir}
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <DragonModal
        open={confirmacaoPendente !== null}
        onClose={() => setConfirmacaoPendente(null)}
        title={modalTitulo}
        dismissable={!loading}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmacaoPendente(null)}
              disabled={loading}
            >
              {m.comum.cancelar}
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={loading}
              onClick={() => {
                if (!confirmacaoPendente) return
                if (confirmacaoPendente.tipo === 'trocar') {
                  executarTrocaOrigemDestino()
                  return
                }
                executarTransferenciaConfirmada(confirmacaoPendente.quantidade)
              }}
            >
              {loading ? t.btn_processando : m.comum.confirmar}
            </Button>
          </>
        }
      >
        <p className="text-body text-fg-muted">{modalDescricao}</p>
      </DragonModal>
    </div>
  )
}
