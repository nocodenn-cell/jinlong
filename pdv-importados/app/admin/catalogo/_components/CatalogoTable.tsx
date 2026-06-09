'use client'

/**
 * FastProduct Admin — CatalogoTable (Fase 4 + R1 lifecycle)
 *
 * Tabela de produtos do catálogo. Paginação server-side via ?page= na URL.
 * R1: coluna status_publicacao + ações Publicar/Inativar por linha.
 */

import Link from 'next/link'
import { APP_ROUTES } from '@/lib/navigation/appRoutes'
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

const ORIGEM_MAP: Record<string, { label: string; badgeClass: string }> = {
  china_manual: { label: 'China', badgeClass: 'admin-v2-badge-gold' },
  brasil_nf: { label: 'Brasil · NF', badgeClass: 'admin-v2-badge-warning' },
  brasil_sem_nf: { label: 'Brasil', badgeClass: 'admin-v2-badge-muted' },
}

const STATUS_MAP: Record<
  StatusPublicacao,
  { label: string; badgeClass: string }
> = {
  DRAFT: { label: 'Rascunho', badgeClass: 'admin-v2-badge-warning' },
  PUBLICADO: { label: 'Publicado', badgeClass: 'admin-v2-badge-success' },
  INATIVO: { label: 'Inativo', badgeClass: 'admin-v2-badge-muted' },
}

function StatusPill({ status }: { status: StatusPublicacao }) {
  const m = STATUS_MAP[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none',
        m.badgeClass,
      )}
    >
      {m.label}
    </span>
  )
}

function OrigemBadge({ origem }: { origem: string }) {
  const m = ORIGEM_MAP[origem]
  if (!m) return <span className="text-jl-fg-3">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none',
        m.badgeClass,
      )}
    >
      {m.label}
    </span>
  )
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

const columns: Column<CatalogoProduto>[] = [
  {
    key: 'produto',
    header: 'Produto',
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
    header: 'Varejo',
    align: 'right',
    sortValue: (r) => r.preco_varejo,
    cell: (r) => (
      <span className="text-[12px] font-medium text-jl-fg-1">{formatBRL(r.preco_varejo)}</span>
    ),
  },
  {
    key: 'atacado',
    header: 'Atacado',
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
    header: 'Estoque',
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
    header: 'Origem',
    cell: (r) => <OrigemBadge origem={r.origem} />,
  },
  {
    key: 'status',
    header: 'Status',
    align: 'center',
    cell: (r) => <StatusPill status={r.status_publicacao} />,
  },
]

function CatalogoEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <span className="text-4xl text-jl-fg-3" aria-hidden>
        📦
      </span>
      <p className="text-[14px] font-medium text-jl-fg-2">Nenhum produto encontrado</p>
      <p className="text-[12px] text-jl-fg-3">
        Tente ajustar os filtros ou cadastre um novo produto
      </p>
      <Link href={APP_ROUTES.admin.catalogoNovo} className="admin-v2-btn-primary mt-2">
        Cadastro rápido
      </Link>
    </div>
  )
}

export function CatalogoTable({ produtos }: { produtos: CatalogoProduto[] }) {
  return (
    <DataTable
      data={produtos}
      columns={columns}
      rowKey={(r) => r.id}
      emptyState={<CatalogoEmpty />}
      className="rounded-none border-x-0 border-b-0"
      rowActions={(row) => (
        <div className="flex items-center justify-end gap-1.5">
          <CatalogoPublicacaoActions produtoId={row.id} status={row.status_publicacao} />
          <ActionBtn href={APP_ROUTES.admin.catalogo} label={`Editar ${row.nome}`}>
            <Pencil size={13} aria-hidden />
          </ActionBtn>
          <ActionBtn href={APP_ROUTES.admin.catalogo} label={`Ver ${row.nome}`}>
            <Eye size={13} aria-hidden />
          </ActionBtn>
        </div>
      )}
    />
  )
}
