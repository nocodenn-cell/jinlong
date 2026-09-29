'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ROUTES,
  adminEstoqueProdutoQuery,
  adminCatalogoCompletoEditarHref,
} from '@shared-core/navigation/routes'
import { Copy, FilterX, ImageIcon, Package, Pencil, Trash2 } from 'lucide-react'
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
import { ProdutosExcluirLoteModal } from '@/components/gerente/produtos/ProdutosExcluirLoteModal'
import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'
import { CatalogoPublicacaoActions } from './CatalogoPublicacaoActions'
import { CatalogoLoteToolbar } from './CatalogoLoteToolbar'
import { atacadoEntradaTexto } from './catalogoAtacadoTexto'

// CatalogoProduto é ProdutoGerenteRow com o campo sku computado adicionado.
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
  vazioFiltrosTitulo: string
  vazioFiltrosSub: string
  limparFiltros: string
  cadastroRapido: string
  origemChina: string
  origemBrasilNf: string
  origemBrasil: string
  /** `{{n}}` = quantidade mínima, `{{preco}}` = preço já formatado. */
  atacadoAPartir: string
  atacadoFaixasUm: string
  /** `{{n}}` = quantas faixas além da de entrada. */
  atacadoFaixasN: string
  acaoEditar: string
  acaoDuplicar: string
  acaoVerEstoque: string
  acaoSelecionarLinha: string
  reativar: string
  inativarConfirmTitulo: string
  inativarConfirmTexto: string
  confirmar: string
  cancelar: string
  fechar: string
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
  hasActiveFilters = false,
}: {
  produtos: CatalogoProduto[]
  labels: CatalogoLabels
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  idioma: Idioma
  hasActiveFilters?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [novoOpen, setNovoOpen] = useState(false)
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(() => new Set())
  const [excluirOpen, setExcluirOpen] = useState(false)
  // Alvo da exclusão, separado da seleção: a lixeira de uma linha exclui só
  // aquela linha sem descartar uma seleção múltipla já feita pelo operador.
  const [excluirIds, setExcluirIds] = useState<readonly string[]>([])

  const idsPagina = produtos.map((p) => p.id)
  const todosSelecionados = idsPagina.length > 0 && idsPagina.every((id) => selecionados.has(id))
  const chavePagina = idsPagina.join(',')

  const alternarLinha = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const alternarPagina = () => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (todosSelecionados) idsPagina.forEach((id) => next.delete(id))
      else idsPagina.forEach((id) => next.add(id))
      return next
    })
  }

  const limparSelecao = () => setSelecionados(new Set())

  // Trocar de página ou de filtro troca o conjunto visível: manter a seleção
  // faria a barra de lote agir sobre produtos que não estão mais na tela.
  useEffect(() => {
    setSelecionados(new Set())
  }, [chavePagina])

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
      key: 'sel',
      header: m.produtos.coluna_selecionar,
      width: '2.25rem',
      headerCell: () => (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 cursor-pointer align-middle accent-[var(--color-brand)]"
          checked={todosSelecionados}
          onChange={alternarPagina}
          aria-label={m.produtos.coluna_selecionar_aria}
        />
      ),
      cell: (row) => (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 cursor-pointer align-middle accent-[var(--color-brand)]"
          checked={selecionados.has(row.id)}
          onChange={() => alternarLinha(row.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={acaoLabel(labels.acaoSelecionarLinha, row.nome)}
        />
      ),
    },
    {
      key: 'produto',
      header: labels.produto,
      // Fixa durante o scroll horizontal em telas estreitas — sem isso, ver
      // Status/Ações (mais à direita) rola o nome do produto pra fora da tela.
      sticky: true,
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
      // Faixa de ENTRADA (menor quantidade mínima ativa em `precos_atacado`) + quantas
      // faixas além dela. É o que o PDV aplica — não `produtos.preco_atacado`.
      cell: (r) => {
        const texto = atacadoEntradaTexto(
          {
            quantidadeMinima: r.quantidade_gatilho_atacado,
            precoUnitario: r.preco_atacado,
            faixasAdicionais: r.atacado_faixas_adicionais,
          },
          labels,
          formatBRL,
        )
        if (!texto) return <span className="text-fg-subtle">—</span>
        return (
          <span className="flex flex-col items-end leading-tight">
            <span className="text-caption text-fg-muted">{texto.principal}</span>
            {texto.extras ? <span className="text-caption text-fg-subtle">{texto.extras}</span> : null}
          </span>
        )
      },
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
        open={novoOpen}
        onOpenChange={setNovoOpen}
        m={m}
        opcoes={opcoes}
        idioma={idioma}
        onCriado={() => router.refresh()}
      />

      <CatalogoLoteToolbar
        ids={[...selecionados]}
        m={m}
        ui={m.admin_ui}
        opcoes={opcoes}
        onLimpar={limparSelecao}
        onExcluir={() => {
          setExcluirIds([...selecionados])
          setExcluirOpen(true)
        }}
      />

      <ProdutosExcluirLoteModal
        open={excluirOpen}
        onOpenChange={(open) => {
          setExcluirOpen(open)
          if (!open) setExcluirIds([])
        }}
        produtoIds={[...excluirIds]}
        m={m}
        onLoteAplicadoComSucesso={() => {
          // Só sai da seleção quem foi realmente excluído.
          setSelecionados((prev) => new Set([...prev].filter((id) => !excluirIds.includes(id))))
          setExcluirIds([])
          router.refresh()
        }}
      />

      <DataTable
        data={produtos}
        columns={columns}
        rowKey={(r) => r.id}
        emptyState={
          hasActiveFilters ? (
            <EmptyState
              icon={<FilterX className="h-6 w-6" aria-hidden />}
              title={labels.vazioFiltrosTitulo}
              description={labels.vazioFiltrosSub}
              actionLabel={labels.limparFiltros}
              onAction={() => router.push(ROUTES.admin.catalogo)}
            />
          ) : (
            <EmptyState
              icon={<Package className="h-6 w-6" aria-hidden />}
              title={labels.vazioTitulo}
              description={labels.vazioSub}
              actionLabel={labels.cadastroRapido}
              onAction={() => setNovoOpen(true)}
            />
          )
        }
        className="rounded-none border-x-0 border-b-0"
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <CatalogoPublicacaoActions
              produtoId={row.id}
              produtoNome={row.nome}
              status={row.status_publicacao}
              labels={{
                publicar: labels.publicar,
                inativar: labels.inativar,
                reativar: labels.reativar,
                confirmarTitulo: labels.inativarConfirmTitulo,
                confirmarTexto: labels.inativarConfirmTexto,
                confirmar: labels.confirmar,
                cancelar: labels.cancelar,
                fechar: labels.fechar,
              }}
              erroGenerico={m.comum.erro}
            />
            <Button
              asChild
              type="button"
              size="icon"
              variant="ghost"
              aria-label={acaoLabel(labels.acaoEditar, row.nome)}
              title={acaoLabel(labels.acaoEditar, row.nome)}
            >
              <Link href={adminCatalogoCompletoEditarHref(row.id)}>
                <Pencil size={13} aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              type="button"
              size="icon"
              variant="ghost"
              aria-label={acaoLabel(labels.acaoDuplicar, row.nome)}
              title={acaoLabel(labels.acaoDuplicar, row.nome)}
            >
              <Link href={`${ROUTES.admin.catalogoCompletoNovo}?duplicarDe=${row.id}`}>
                <Copy size={13} aria-hidden />
              </Link>
            </Button>
            {/* Não existe tela de detalhe somente leitura — `/admin/catalogo/[id]`
                sem sufixo nunca foi criada, só `/admin/catalogo/[id]/completo`
                (edição). O antigo botão "Ver" apontava para a própria lista —
                clicar não fazia nada. Editar já mostra todos os campos. */}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={m.produtos.exclusao_linha_aria}
              title={m.produtos.exclusao_linha_title}
              onClick={() => {
                setExcluirIds([row.id])
                setExcluirOpen(true)
              }}
            >
              <Trash2 size={13} aria-hidden />
            </Button>
          </div>
        )}
      />
    </>
  )
}