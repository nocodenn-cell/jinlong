/**
 * FastProduct Admin — Detalhe do produto (somente leitura).
 *
 * Reusa as queries existentes (buscarProdutoDetalhe, listarOpcoesFiltrosProdutos,
 * listarFaixasAtacado) — nenhuma lógica de preço nova. A edição continua sendo
 * feita pelo modal na lista do catálogo (`/admin/catalogo`).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ROUTES } from '@shared-core/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { formatBRL } from '@/lib/format/money'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import {
  buscarProdutoDetalhe,
  listarOpcoesFiltrosProdutos,
} from '@/app/gerente/produtos/actions'
import { listarFaixasAtacado } from '@/app/gerente/produtos/precosAtacadoActions'

type PageProps = { params: Promise<{ id: string }> }

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-jl-fg-3">{label}</p>
      <p className="mt-1 text-sm font-medium text-jl-fg-1">{value}</p>
    </div>
  )
}

export default async function AdminCatalogoProdutoDetalhePage({ params }: PageProps) {
  const { id } = await params
  const { session } = await loadAdminContext({
    pathname: `${ROUTES.admin.catalogo}/${id}`,
    resource: `route:${ROUTES.admin.catalogo}/[id]`,
  })
  const { idioma } = session
  const m = getMessages(idioma)
  const p = m.produtos

  const [produtoRes, opcoesRes, faixasRes] = await Promise.all([
    buscarProdutoDetalhe(id),
    listarOpcoesFiltrosProdutos(),
    listarFaixasAtacado(id),
  ])

  if (!produtoRes.success) notFound()

  const produto = produtoRes.data
  const opcoes = opcoesRes.success ? opcoesRes.data : { categorias: [], marcas: [], fornecedores: [] }
  const faixas = faixasRes.success ? faixasRes.data : []

  const nomeDe = (arr: { id: string; nome: string }[], id: string | null) =>
    id ? (arr.find((x) => x.id === id)?.nome ?? '—') : '—'

  return (
    <div className="admin-v2-page">
      <Link
        href={ROUTES.admin.catalogo}
        className="mb-3 inline-flex text-xs font-medium text-jl-accent hover:underline"
      >
        {p.detalhe_voltar}
      </Link>

      <PageHeader title={produto.nome} subtitle={p.detalhe_editar_no_catalogo} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title={p.detalhe_secao_dados}>
          <div className="grid grid-cols-2 gap-4">
            <Campo label={p.codigo_interno_label} value={produto.codigo_interno ?? '—'} />
            <Campo label={p.codigo_barras} value={produto.codigo_barras ?? '—'} />
            <Campo label={p.categoria_label} value={nomeDe(opcoes.categorias, produto.categoria_id)} />
            <Campo label={p.marca_label} value={nomeDe(opcoes.marcas, produto.marca_id)} />
            <Campo label={p.unidade_medida} value={produto.unidade_medida} />
            <Campo label={p.status} value={produto.status_publicacao} />
          </div>
        </SectionCard>

        <SectionCard title={p.detalhe_secao_precos}>
          <Campo label={p.preco_varejo} value={formatBRL(produto.preco_varejo)} />

          <p className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
            {p.titulo_faixas_atacado}
          </p>
          {faixas.length === 0 ? (
            <p className="text-xs text-jl-fg-3">{p.faixa_vazio}</p>
          ) : (
            <ul className="space-y-1">
              {faixas.map((f) => (
                <li key={f.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-jl-fg-2">{f.quantidade_minima}+ {p.faixa_unidades}</span>
                  <span className="font-mono font-medium text-jl-fg-1">{formatBRL(f.preco_unitario)}</span>
                </li>
              ))}
            </ul>
          )}

          {produto.preco_atacado != null ? (
            <div className="mt-4 border-t border-[var(--color-border-secondary)] pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
                {p.atacado_legado_titulo}
              </p>
              <p className="mt-1 text-sm font-mono text-jl-fg-1">
                {produto.quantidade_gatilho_atacado ?? '—'}+ {p.faixa_unidades} → {formatBRL(produto.preco_atacado)}
              </p>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title={p.detalhe_secao_estoque}>
          <div className="grid grid-cols-2 gap-4">
            <Campo label={p.estoque_atual_label} value={produto.quantidade_atual !== null ? String(produto.quantidade_atual) : '—'} />
            <Campo label={p.estoque_minimo_label} value={produto.estoque_minimo !== null ? String(produto.estoque_minimo) : '—'} />
            <Campo label={p.localizacao_prateleira_label} value={produto.localizacao_prateleira ?? '—'} />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
