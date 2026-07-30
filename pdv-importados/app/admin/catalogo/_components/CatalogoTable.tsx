'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { adminEstoqueProdutoQuery } from '@shared-core/navigation/routes'
import { Copy, ImageIcon, Package, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { formatBRL } from '@/lib/format/money'
import type { StatusPublicacao } from '@/core/ports/produto'
import { cn } from '@/lib/utils'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
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
  acaoEditar: string
  acaoDuplicar: string
  acaoVerEstoque: string
}

/** `{{nome}}` → nome do produto; mantém o rótulo traduzível. */
function acaoLabel(template: string, nome: string): string {
  return template.replace('{{nome}}', nome)
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

export function CatalogoTable({
  produtos,
  labels,
  m,
  opcoes,
  idioma,
}: {
  produtos: CatalogoProduto[]
  labels: CatalogoLabels
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  idioma: Idioma
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
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border-secondary)] bg-[var(--color-surface-soft)]">
            {row.imagem_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic catalog URLs; dimensions unknown at build
              <img src={row.imagem_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={12} className="text-fg-subtle" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <p className="max-w-[200px] truncate text-body font-medium text-fg">{row.nome}</p>
            <p className="font-mono text-mono text-caption text-fg-subtle">{row.sku}</p>
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
        <span className="text-body font-medium text-fg">{formatBRL(r.preco_varejo)}</span>
      ),
    },
    {
      key: 'atacado',
      header: labels.atacado,
      align: 'right',
      cell: (r) =>
        r.preco_atacado != null ? (
          <span className="text-caption text-fg-muted">{formatBRL(r.preco_atacado)}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'estoque',
      header: labels.estoque,
      align: 'right',
      sortValue: (r) => r.quantidade_atual ?? Number.NEGATIVE_INFINITY,
      cell: (r) => {
        if (r.quantidade_atual === null) return <span className="text-fg-subtle">—</span>
        const v = r.quantidade_atual
        // Código de barras primeiro: buscar por nome traz vários homônimos e o
        // operador cai numa lista ambígua em vez do produto que clicou.
        const estoqueHref = adminEstoqueProdutoQuery(r.codigo_barras || r.nome)
        return (
          <Link
            href={estoqueHref}
            title={labels.acaoVerEstoque}
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
        if (!meta) return <span className="text-fg-subtle">—</span>
        const origemLabel = r.origem === 'china_manual' ? labels.origemChina
          : r.origem === 'brasil_nf' ? labels.origemBrasilNf
          : labels.origemBrasil
        return (
          <Badge className={cn('px-2 py-[2px] text-caption font-medium leading-none', meta.badgeClass)}>
            {origemLabel}
          </Badge>
        )
      },
    },
    {
      key: 'status',
      header: labels.status,
      align: 'center',
      cell: (r) => (
        <Badge
          className={cn(
            'px-2 py-[2px] text-caption font-medium leading-none',
            STATUS_BADGE_CLASS[r.status_publicacao],
          )}
        >
          {statusLabel[r.status_publicacao]}
        </Badge>
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
        idioma={idioma}
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
          <EmptyState
            icon={<Package className="h-6 w-6" aria-hidden />}
            title={labels.vazioTitulo}
            description={labels.vazioSub}
            actionLabel={labels.cadastroRapido}
            onAction={() => setNovoOpen(true)}
          />
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
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={acaoLabel(labels.acaoEditar, row.nome)}
              title={acaoLabel(labels.acaoEditar, row.nome)}
              onClick={() => setEditando(row)}
            >
              <Pencil size={13} aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={acaoLabel(labels.acaoDuplicar, row.nome)}
              title={acaoLabel(labels.acaoDuplicar, row.nome)}
              onClick={() => setDuplicando(row)}
            >
              <Copy size={13} aria-hidden />
            </Button>
            {/* Não existe tela de detalhe do produto (`/admin/catalogo/[id]` nunca
                foi criada). O antigo botão "Ver" apontava para a própria lista —
                clicar não fazia nada. Editar já mostra todos os campos. */}
          </div>
        )}
      />

      <ProdutosEditarCatalogoModal
        open={editando !== null}
        onOpenChange={(open) => { if (!open) setEditando(null) }}
        produto={editando}
        m={m}
        opcoes={opcoes}
        idioma={idioma}
        onSalvo={() => {
          setEditando(null)
          router.refresh()
        }}
        // Trocar a foto não fecha a edição — só atualiza a lista por baixo.
        onImagemAtualizada={() => router.refresh()}
      />
    </>
  )
}