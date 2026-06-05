'use client'

/**
 * FastProduct Admin — CatalogoTable (Fase 4)
 *
 * Tabela de produtos do catálogo. Usa o DataTable genérico da Fase 2 (API real:
 * columns/rowKey/rowActions/emptyState + sort client-side). A PAGINAÇÃO é
 * server-side (via ?page= na URL, resolvida no page.tsx) — esta tabela só
 * renderiza a página atual.
 *
 * Adaptações conscientes (Fase 4 "lean", sem modificar components/ui/):
 *   - Sem seleção/ações em lote (deferido — disponível em /gerente/produtos).
 *   - `status` (ativo:boolean) e `origem` (china_manual/brasil_nf/brasil_sem_nf)
 *     mapeados inline aqui — os badges genéricos têm outra semântica.
 *   - Estoque: sem `estoque_minimo` na linha → cor só por saldo (≤0 vermelho).
 *   - Preços em REAIS (não centavos).
 */

import Link from 'next/link'
import { Eye, ImageIcon, Pencil } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { OriginBadge, type Origin } from '@/components/ui/badges'
import { formatBRL } from '@/lib/format/money'

export type CatalogoProduto = {
  id: string
  nome: string
  sku: string
  imagem_url: string | null
  preco_varejo: number
  preco_atacado: number | null
  quantidade_gatilho_atacado: number | null
  quantidade_atual: number | null
  /** 'china_manual' | 'brasil_nf' | 'brasil_sem_nf' (ou outro string do banco). */
  origem: string
  ativo: boolean
}

const ORIGEM_MAP: Record<string, { origin: Origin; label: string }> = {
  china_manual: { origin: 'IMPORTADO', label: 'China' },
  brasil_nf: { origin: 'NFE', label: 'Brasil · NF' },
  brasil_sem_nf: { origin: 'NACIONAL', label: 'Brasil' },
}

function StatusPill({ ativo }: { ativo: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-medium leading-none"
      style={
        ativo
          ? {
              background: 'var(--fp-success-bg)',
              border: '1px solid var(--fp-success-border)',
              color: 'var(--fp-success)',
            }
          : {
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--fp-border)',
              color: 'var(--fp-text-muted)',
            }
      }
    >
      {ativo ? 'Ativo' : 'Inativo'}
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
      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-700 bg-zinc-800">
          {row.imagem_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.imagem_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={12} className="text-zinc-600" aria-hidden />
          )}
        </div>
        <div className="min-w-0">
          <p className="max-w-[200px] truncate text-[12px] font-medium text-zinc-200">{row.nome}</p>
          <p className="font-mono text-[10px] text-zinc-600">{row.sku}</p>
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
      <span className="text-[12px] font-medium text-zinc-200">{formatBRL(r.preco_varejo)}</span>
    ),
  },
  {
    key: 'atacado',
    header: 'Atacado',
    align: 'right',
    cell: (r) =>
      r.preco_atacado != null ? (
        <div className="text-right">
          <p className="text-[11px] text-zinc-400">{formatBRL(r.preco_atacado)}</p>
          {r.quantidade_gatilho_atacado != null ? (
            <p className="text-[9px] text-zinc-600">≥ {r.quantidade_gatilho_atacado} un.</p>
          ) : null}
        </div>
      ) : (
        <span className="text-zinc-700">—</span>
      ),
  },
  {
    key: 'estoque',
    header: 'Estoque',
    align: 'right',
    sortValue: (r) => r.quantidade_atual ?? Number.NEGATIVE_INFINITY,
    cell: (r) => {
      if (r.quantidade_atual === null) return <span className="text-zinc-700">—</span>
      const v = r.quantidade_atual
      return (
        <span className={v <= 0 ? 'font-medium text-red-400' : 'text-green-400'}>{v}</span>
      )
    },
  },
  {
    key: 'origem',
    header: 'Origem',
    cell: (r) => {
      const m = ORIGEM_MAP[r.origem]
      return m ? <OriginBadge origin={m.origin} label={m.label} /> : <span className="text-zinc-700">—</span>
    },
  },
  {
    key: 'status',
    header: 'Status',
    align: 'center',
    cell: (r) => <StatusPill ativo={r.ativo} />,
  },
]

function CatalogoEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <span className="text-4xl text-zinc-700" aria-hidden>
        📦
      </span>
      <p className="text-[14px] font-medium text-zinc-400">Nenhum produto encontrado</p>
      <p className="text-[12px] text-zinc-600">
        Tente ajustar os filtros ou cadastre um novo produto
      </p>
      <Link
        href="/gerente/produtos"
        className="mt-2 rounded-lg bg-white px-4 py-2 text-[12px] font-medium text-zinc-950 hover:bg-zinc-100"
      >
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
      className="rounded-none border-x-0"
      rowActions={(row) => (
        <div className="flex items-center justify-end gap-1">
          {/* Rotas /admin/catalogo/[id] ainda não existem (transitório → /gerente/produtos) */}
          <ActionBtn href="/gerente/produtos" label={`Editar ${row.nome}`}>
            <Pencil size={13} aria-hidden />
          </ActionBtn>
          <ActionBtn href="/gerente/produtos" label={`Ver ${row.nome}`}>
            <Eye size={13} aria-hidden />
          </ActionBtn>
        </div>
      )}
    />
  )
}
