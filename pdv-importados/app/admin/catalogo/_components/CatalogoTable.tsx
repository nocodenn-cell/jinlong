'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ROUTES } from '@shared-core/navigation/routes'
import { ImageIcon, Pencil } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import type { StatusPublicacao } from '@/core/ports/produto'
import { cn } from '@/lib/utils'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { Mensagens } from '@/i18n/getMessages'
import { ProdutosEditarCatalogoModal } from '@/components/gerente/produtos/ProdutosEditarCatalogoModal'
import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'
import { CatalogoPublicacaoActions } from './CatalogoPublicacaoActions'

export type CatalogoProduto = ProdutoGerenteRow & {
  sku: string
}

export type CatalogoLabels = {
  produto: string
  varejo: string
  atacado: string
  estoque: string
  origem: string
  status: string
  rascunho: string
  publicado: string
  inativo: string
  publicar: string
  inativar: string
  vazioTitulo: string
  vazioSub: string
  cadastroRapido: string
  origemChina: string
  origemBrasilNf: string
  origemBrasil: string
}

/**
 * Badge de status inline — indica situação do produto dentro da célula Descrição.
 * Padrão Bling: status não ocupa coluna separada, fica como chip discreto na linha.
 */
const STATUS_DOT_CLASS: Record<StatusPublicacao, string> = {
  DRAFT:     'bg-amber-400',
  PUBLICADO: 'bg-emerald-500',
  INATIVO:   'bg-slate-500',
}

function OrigemBadge({ origem, labels }: { origem: string; labels: CatalogoLabels }) {
  if (origem === 'china_manual')  return <span className="admin-v2-badge-gold   inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none">{labels.origemChina}</span>
  if (origem === 'brasil_nf')     return <span className="admin-v2-badge-warning inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none">{labels.origemBrasilNf}</span>
  if (origem === 'brasil_sem_nf') return <span className="admin-v2-badge-muted   inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none">{labels.origemBrasil}</span>
  return null
}

export function CatalogoTable({
  produtos,
  labels,
  m,
  opcoes,
}: {
  produtos: CatalogoProduto[]
  labels: CatalogoLabels
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
}) {
  const router = useRouter()
  const [editando, setEditando] = useState<CatalogoProduto | null>(null)
  const [novoOpen, setNovoOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setNovoOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const statusLabel: Record<StatusPublicacao, string> = {
    DRAFT:     labels.rascunho,
    PUBLICADO: labels.publicado,
    INATIVO:   labels.inativo,
  }

  /**
   * Colunas na ordem do Bling:
   * Imagem | Descrição | Código | Unidade | Preço | Estoque | [Ações]
   */
  const columns: Column<CatalogoProduto>[] = [
    // 1. IMAGEM — coluna estreita, apenas thumbnail (padrão Bling)
    {
      key: 'img',
      header: 'Imagem',
      width: '60px',
      className: 'py-2',
      cell: (row) => (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--admin-v2-border)] bg-[rgba(255,255,255,0.03)]">
          {row.imagem_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.imagem_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={14} className="text-jl-fg-3" aria-hidden />
          )}
        </div>
      ),
    },

    // 2. DESCRIÇÃO — nome + status dot + origem badge (padrão Bling: tudo na mesma célula)
    {
      key: 'descricao',
      header: 'Descrição',
      sortValue: (r) => r.nome,
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT_CLASS[row.status_publicacao])}
              title={statusLabel[row.status_publicacao]}
              aria-label={statusLabel[row.status_publicacao]}
            />
            <p className="max-w-[280px] truncate text-[12px] font-medium text-jl-fg-1">{row.nome}</p>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <OrigemBadge origem={row.origem} labels={labels} />
          </div>
        </div>
      ),
    },

    // 3. CÓDIGO — SKU separado (padrão Bling: coluna própria para código)
    {
      key: 'codigo',
      header: 'Código',
      sortValue: (r) => r.sku,
      cell: (r) => (
        <span className="font-mono text-[11px] text-jl-fg-2">{r.sku}</span>
      ),
    },

    // 4. UNIDADE — padrão Bling (UN, KG, CX, etc.)
    {
      key: 'unidade',
      header: 'Unidade',
      align: 'center',
      cell: (r) => (
        <span className="text-[11px] uppercase text-jl-fg-3">{r.unidade_medida}</span>
      ),
    },

    // 5. PREÇO — preço de varejo (padrão Bling: coluna "Preço" singular)
    {
      key: 'preco',
      header: 'Preço',
      align: 'right',
      sortValue: (r) => r.preco_varejo,
      cell: (r) => (
        <div className="text-right">
          <span className="text-[12px] font-medium text-jl-fg-1">{formatBRL(r.preco_varejo)}</span>
          {r.preco_atacado != null ? (
            <p className="text-[10px] text-jl-fg-3">Atac. {formatBRL(r.preco_atacado)}</p>
          ) : null}
        </div>
      ),
    },

    // 6. ESTOQUE — saldo atual com indicador de cor (padrão Bling)
    {
      key: 'estoque',
      header: 'Estoque',
      align: 'right',
      sortValue: (r) => r.quantidade_atual ?? Number.NEGATIVE_INFINITY,
      cell: (r) => {
        if (r.quantidade_atual === null) return <span className="text-jl-fg-3">—</span>
        const v = r.quantidade_atual
        return (
          <span className={cn('text-[12px] font-medium', v <= 0 ? 'text-red-400' : 'text-emerald-400')}>
            {v}
          </span>
        )
      },
    },
  ]

  return (
    <>
      <NovoProdutoModal
        open={novoOpen}
        onOpenChange={setNovoOpen}
        m={m}
        opcoes={opcoes}
        onCriado={() => {
          setNovoOpen(false)
          router.refresh()
        }}
      />

      <DataTable
        data={produtos}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span className="text-4xl text-jl-fg-3" aria-hidden>📦</span>
            <p className="text-[14px] font-medium text-jl-fg-2">{labels.vazioTitulo}</p>
            <p className="text-[12px] text-jl-fg-3">{labels.vazioSub}</p>
            <button
              type="button"
              onClick={() => setNovoOpen(true)}
              className="admin-v2-btn-primary mt-2"
            >
              {labels.cadastroRapido}
            </button>
          </div>
        }
        className="rounded-none border-x-0 border-b-0"
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <CatalogoPublicacaoActions
              produtoId={row.id}
              status={row.status_publicacao}
              labels={{ publicar: labels.publicar, inativar: labels.inativar }}
            />
            <button
              type="button"
              aria-label={`Editar ${row.nome}`}
              title={`Editar ${row.nome}`}
              onClick={() => setEditando(row)}
              className="flex h-7 w-7 items-center justify-center rounded text-jl-fg-3 transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-jl-fg-1"
            >
              <Pencil size={13} aria-hidden />
            </button>
          </div>
        )}
      />

      <ProdutosEditarCatalogoModal
        open={editando !== null}
        onOpenChange={(open) => { if (!open) setEditando(null) }}
        produto={editando}
        m={m}
        opcoes={opcoes}
        onSalvo={() => {
          setEditando(null)
          router.refresh()
        }}
      />
    </>
  )
}
