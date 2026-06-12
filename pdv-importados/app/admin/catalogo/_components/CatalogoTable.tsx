'use client'

import Link from 'next/link'
import { ROUTES } from '@shared-core/navigation/routes'
import { Eye, ImageIcon, Pencil } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import type { StatusPublicacao } from '@/core/ports/produto'
import { cn } from '@/lib/utils'
import { CatalogoPublicacaoActions } from './CatalogoPublicacaoActions'

export type CatalogoProduto = {
  id: string
  nome: string
  sku: string
  imagem_url: string | null
  preco_varejo: number
  preco_atacado: number | null
  quantidade_gatilho_atacado: number | null
  quantidade_atual: number | null
  origem: string
  ativo: boolean
  status_publicacao: StatusPublicacao
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
      className="flex h-7 w-7 items-center justify-center rounded-lg text-jl-fg-3 transition-colors hover:bg-[#161616] hover:text-jl-fg-1"
    >
      {children}
    </Link>
  )
}

export function CatalogoTable({ produtos, labels }: { produtos: CatalogoProduto[]; labels: CatalogoLabels }) {
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
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#242424] bg-[#111111]">
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
          <div className="text-right">
            <p className="text-[11px] text-jl-fg-2">{formatBRL(r.preco_atacado)}</p>
            {r.quantidade_gatilho_atacado != null ? (
              <p className="text-[9px] text-jl-fg-3">≥ {r.quantidade_gatilho_atacado} un.</p>
            ) : null}
          </div>
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
        return (
          <span className={v <= 0 ? 'font-medium text-red-400' : 'text-emerald-400'}>{v}</span>
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
    <DataTable
      data={produtos}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState={
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="text-4xl text-jl-fg-3" aria-hidden>📦</span>
          <p className="text-[14px] font-medium text-jl-fg-2">{labels.vazioTitulo}</p>
          <p className="text-[12px] text-jl-fg-3">{labels.vazioSub}</p>
          <Link href={ROUTES.admin.catalogoNovo} className="admin-v2-btn-primary mt-2">
            {labels.cadastroRapido}
          </Link>
        </div>
      }
      className="rounded-none border-x-0 border-b-0"
      rowActions={(row) => (
        <div className="flex items-center justify-end gap-1.5">
          <CatalogoPublicacaoActions
            produtoId={row.id}
            status={row.status_publicacao}
            labels={{ publicar: labels.publicar, inativar: labels.inativar }}
          />
          <ActionBtn href={ROUTES.admin.catalogo} label={`Editar ${row.nome}`}>
            <Pencil size={13} aria-hidden />
          </ActionBtn>
          <ActionBtn href={ROUTES.admin.catalogo} label={`Ver ${row.nome}`}>
            <Eye size={13} aria-hidden />
          </ActionBtn>
        </div>
      )}
    />
  )
}
