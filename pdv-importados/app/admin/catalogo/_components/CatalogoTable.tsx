'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ROUTES, adminEstoqueProdutoQuery } from '@shared-core/navigation/routes'
import { Copy, Eye, ImageIcon, Pencil } from 'lucide-react'
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

// CatalogoProduto é ProdutoGerenteRow com o campo sku computado adicionado.
// Sendo superconjunto de ProdutoGerenteRow, pode ser passado diretamente ao modal de edição.
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

const ORIGEM_MAP: Record<string, { badgeClass: string }> = {
  china_manual: { badgeClass: 'admin-v2-badge-gold' },
  brasil_nf: { badgeClass: 'admin-v2-badge-warning' },
  brasil_sem_nf: { badgeClass: 'admin-v2-badge-muted' },
}

const STATUS_BADGE_CLASS: Record<StatusPublicacao, string> = {
  DRAFT: 'admin-v2-badge-warning',
  PUBLICADO: 'admin-v2-badge-success',
  INATIVO: 'admin-v2-badge-muted',
}

function ActionBtn({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-jl-fg-3 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
    >
      {children}
    </Link>
  )
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
  const searchParams = useSearchParams()
  const [editando, setEditando] = useState<CatalogoProduto | null>(null)
  const [novoOpen, setNovoOpen] = useState(false)
  const [duplicando, setDuplicando] = useState<CatalogoProduto | null>(null)

  useEffect(() => {
    if (searchParams.get('modal') === 'novo') {
      setNovoOpen(true)
    }
  }, [searchParams])

  useEffect(() => {
    // Não reabrir "novo produto" por cima de um modal já aberto (editar,
    // duplicar ou o próprio "novo") — o listener é global e não é limitado ao
    // foco estar dentro do modal, então isso podia empilhar dois modals
    // simultâneos (inclusive dois usando o mesmo NovoProdutoModal).
    if (novoOpen || editando || duplicando) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
        e.preventDefault()
        setNovoOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [novoOpen, editando, duplicando])

  const statusLabel: Record<StatusPublicacao, string> = {
    DRAFT: labels.rascunho,
    PUBLICADO: labels.publicado,
    INATIVO: labels.inativo,
  }

  const columns: Column<CatalogoProduto>[] = [
    {
      key: 'produto',
      header: labels.produto,
      sortValue: (r) => r.nome,
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border-secondary)] bg-jl-surface-soft">
            {row.imagem_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic catalog URLs; dimensions unknown at build
              <img src={row.imagem_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={12} className="text-jl-fg-3" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <p className="max-w-[200px] truncate text-[12px] font-medium text-jl-fg-1">{row.nome}</p>
            <p className="font-mono text-[10px] text-jl-fg-3">{row.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'varejo',
      header: labels.varejo,
      align: 'right',
      sortValue: (r) => r.preco_varejo,
      cell: (r) => (
        <span className="text-[12px] font-medium text-jl-fg-1">{formatBRL(r.preco_varejo)}</span>
      ),
    },
    {
      key: 'atacado',
      header: labels.atacado,
      align: 'right',
      cell: (r) =>
        r.preco_atacado != null ? (
          <span className="text-[11px] text-jl-fg-2">{formatBRL(r.preco_atacado)}</span>
        ) : (
          <span className="text-jl-fg-3">—</span>
        ),
    },
    {
      key: 'estoque',
      header: labels.estoque,
      align: 'right',
      sortValue: (r) => r.quantidade_atual ?? Number.NEGATIVE_INFINITY,
      cell: (r) => {
        if (r.quantidade_atual === null) return <span className="text-jl-fg-3">—</span>
        const v = r.quantidade_atual
        const estoqueHref = adminEstoqueProdutoQuery(r.nome)
        return (
          <Link
            href={estoqueHref}
            title="Ver e ajustar no estoque"
            className={cn(
              'tabular-nums underline-offset-2 hover:underline',
              v <= 0 ? 'font-medium text-red-400' : 'text-emerald-400',
            )}
          >
            {v}
          </Link>
        )
      },
    },
    {
      key: 'origem',
      header: labels.origem,
      cell: (r) => {
        const meta = ORIGEM_MAP[r.origem]
        if (!meta) return <span className="text-jl-fg-3">—</span>
        const origemLabel = r.origem === 'china_manual' ? labels.origemChina
          : r.origem === 'brasil_nf' ? labels.origemBrasilNf
          : labels.origemBrasil
        return (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none',
              meta.badgeClass,
            )}
          >
            {origemLabel}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: labels.status,
      align: 'center',
      cell: (r) => (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none',
            STATUS_BADGE_CLASS[r.status_publicacao],
          )}
        >
          {statusLabel[r.status_publicacao]}
        </span>
      ),
    },
  ]

  return (
    <>
      <NovoProdutoModal
        open={novoOpen || duplicando !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNovoOpen(false)
            setDuplicando(null)
          }
        }}
        m={m}
        opcoes={opcoes}
        duplicarDe={duplicando}
        onCriado={() => {
          setDuplicando(null)
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
          <div className="flex items-center justify-end gap-1.5">
            <CatalogoPublicacaoActions
              produtoId={row.id}
              status={row.status_publicacao}
              labels={{ publicar: labels.publicar, inativar: labels.inativar }}
              erroGenerico={m.comum.erro}
            />
            <button
              type="button"
              aria-label={`Editar ${row.nome}`}
              title={`Editar ${row.nome}`}
              onClick={() => setEditando(row)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-jl-fg-3 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
            >
              <Pencil size={13} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Duplicar ${row.nome}`}
              title={`Duplicar ${row.nome}`}
              onClick={() => setDuplicando(row)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-jl-fg-3 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
            >
              <Copy size={13} aria-hidden />
            </button>
            <ActionBtn href={ROUTES.admin.catalogo} label={`Ver ${row.nome}`}>
              <Eye size={13} aria-hidden />
            </ActionBtn>
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