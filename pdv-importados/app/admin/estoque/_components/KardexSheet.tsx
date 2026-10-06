'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/navigation/routes'
import { obterKardexProduto, type KardexMovimento } from '../actions'
import { DragonModal } from '@/components/ui/DragonModal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ErrorState, EmptyState, Loading } from '@/components/ui/feedback'
import { MovementBadge } from '@/components/ui/MovementBadge'
import { StatusChip } from '@/components/ui/StatusChip'
import { humanizarCodigo } from '@/lib/format/vendaLabels'

export type KardexAlvo = Readonly<{ produtoId: string; produtoNome: string }>

export type KardexLabels = {
  titulo: string
  semMovimentos: string
  semMovimentosSub: string
  tipoMap: Record<string, string>
  /** RM-10: link de volta para a trilha de auditoria (filtro geral de ajustes de estoque). */
  verAuditoria: string
}

const dtFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * `observacao` do log vem como texto técnico (`devolucao | motivo=troca | operacao=<uuid>`).
 * Só apresentação: mostra o motivo legível e esconde o id da operação (o dado persistido não muda).
 */
export function formatObservacaoKardex(observacao: string | null | undefined): string {
  const partes = String(observacao ?? '')
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p && !/^operacao=/i.test(p))
  const motivos = partes.filter((p) => /^motivo=/i.test(p)).map((p) => p.replace(/^motivo=/i, '').trim())
  return (motivos.length > 0 ? motivos : partes).filter(Boolean).join(' · ')
}

const fmtSaldo = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

/** Tipos de movimento → tom de StatusChip (mesmo padrão visual). */
function toneStatusForTipo(codigo: string, entrada: boolean): string {
  if (codigo === 'VENDA' || codigo === 'SAIDA' || codigo === 'PERDA' || codigo === 'QUEBRA') {
    return 'ERRO'
  }
  if (codigo === 'AJUSTE' || codigo === 'ACERTO_INVENTARIO' || codigo === 'TRANSFERENCIA') {
    return 'PENDENTE'
  }
  return entrada ? 'ATIVO' : 'INATIVO'
}

export function KardexSheet({
  alvo,
  onClose,
  labels,
  idioma = 'pt',
}: {
  alvo: KardexAlvo | null
  onClose: () => void
  labels: KardexLabels
  idioma?: 'pt' | 'zh'
}) {
  const [movimentos, setMovimentos] = useState<KardexMovimento[]>([])
  const zh = idioma === 'zh'
  const [limite, setLimite] = useState(60)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => { setLimite(60) }, [alvo?.produtoId])

  useEffect(() => {
    if (!alvo) return
    let vivo = true
    setCarregando(true)
    setErro(null)
    setMovimentos([])
    obterKardexProduto(alvo.produtoId, limite)
      .then((rows) => {
        if (vivo) setMovimentos(rows)
      })
      .catch((error: unknown) => { if (vivo) setErro(error instanceof Error ? error.message : 'Erro ao carregar movimentos.') })
      .finally(() => {
        if (vivo) setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [alvo, limite])

  const rotuloTipo = (codigo: string): string =>
    labels.tipoMap[codigo] ?? humanizarCodigo(codigo)

  // Sem nenhum saldo provado (histórico não fecha com o estoque atual), a coluna some em vez de mostrar "—" em tudo.
  const temSaldo = movimentos.some((m) => m.saldo_apos != null)

  const columns: Column<KardexMovimento>[] = useMemo(
    () => [
      {
        key: 'quando',
        header: zh ? '日期' : 'Data',
        cell: (m) => (
          <span className="whitespace-nowrap text-caption text-fg-subtle">
            {dtFmt.format(new Date(m.created_at))}
          </span>
        ),
      },
      {
        key: 'tipo',
        header: zh ? '类型' : 'Tipo',
        priority: 'primary',
        cell: (m) => (
          <StatusChip
            status={toneStatusForTipo(m.tipo_codigo, m.quantidade_delta >= 0)}
            label={rotuloTipo(m.tipo_codigo)}
          />
        ),
      },
      {
        key: 'delta',
        header: zh ? '数量' : 'Qtd',
        align: 'right',
        cell: (m) => <MovementBadge delta={m.quantidade_delta} />,
      },
      {
        key: 'saldo',
        header: zh ? '操作后库存' : 'Saldo após',
        align: 'right',
        cell: (m) => (
          <span className="whitespace-nowrap tabular-nums text-body text-fg">
            {m.saldo_apos == null ? '—' : fmtSaldo.format(m.saldo_apos)}
          </span>
        ),
      },
      {
        key: 'usuario',
        header: zh ? '用户' : 'Usuário',
        cell: (m) => (
          <span className="block max-w-[9rem] truncate text-caption text-fg-subtle" title={m.usuario_nome ?? undefined}>
            {m.usuario_nome ?? '—'}
          </span>
        ),
      },
      {
        key: 'motivo',
        header: zh ? '原因' : 'Motivo',
        className: 'max-w-[14rem]',
        cell: (m) => {
          const texto = formatObservacaoKardex(m.observacao)
          return texto ? (
            <span className="block truncate text-caption text-fg-subtle" title={texto}>
              {texto}
            </span>
          ) : (
            <span className="text-caption text-fg-subtle">—</span>
          )
        },
      },
    ],
    // labels.tipoMap identity is stable per open; rotuloTipo closes over labels
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labels, zh],
  )
  const colunasVisiveis = useMemo(
    () => columns.filter((c) => c.key !== 'saldo' || temSaldo),
    [columns, temSaldo],
  )

  if (!alvo) return null

  return (
    <DragonModal
      open
      onClose={onClose}
      sheet
      size="lg"
      icon={History}
      title={labels.titulo}
      subtitle={alvo.produtoNome}
      closeLabel={zh ? "关闭" : "Fechar"}
      footer={
        <Link
          href={`${ROUTES.admin.estoqueMovimentacoes}?q=${encodeURIComponent(alvo.produtoNome)}`}
          className="text-caption font-medium text-[var(--color-info)] hover:underline"
        >
          {zh ? '查看全部库存变动' : 'Ver todas as movimentações deste produto'}
        </Link>
      }
    >
      {erro ? <ErrorState dense description={erro} onRetry={() => setLimite((value) => value + 1)} /> : carregando ? (
        <Loading label="…" className="min-h-0 py-12" size="sm" />
      ) : (
        <DataTable
          columns={colunasVisiveis}
          data={movimentos}
          rowKey={(m) => m.id}
          emptyState={
            <EmptyState title={labels.semMovimentos} description={labels.semMovimentosSub} />
          }
          className="rounded-none border-0"
        />
      )}
      {!erro && !carregando && movimentos.length > 0 && !temSaldo ? <p className="mt-2 text-caption text-fg-muted">
        {zh ? '历史记录无法与当前库存核对，因此未显示操作后库存。' : 'O histórico não fecha com o saldo atual; o saldo após cada movimento não pôde ser comprovado.'}
      </p> : null}
      {!erro && !carregando && movimentos.length >= limite && limite < 1000 ? <Button variant="outline" onClick={() => setLimite((value) => value + 60)}>{zh ? '加载更多' : 'Carregar mais movimentos'}</Button> : null}
    </DragonModal>
  )
}
