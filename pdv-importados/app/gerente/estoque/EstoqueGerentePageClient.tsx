'use client'

import { useCallback, useMemo, useState } from 'react'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { GerenteNavLink } from '@/components/gerente/GerenteNavLink'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { fmtQuantidadeEstoque } from '@/lib/format/fmtQuantidadeEstoque'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { useGerenteQuery } from '@/lib/hooks/useGerenteQuery'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import {
  atualizarEstoqueProdutoThrow,
  garantirLinhaEstoqueThrow,
  obterDadosEstoqueGerente,
  type EstoqueBaixoRowDTO,
  type ProdutoComEstoqueDTO,
} from './actions'
import { EstoqueAjusteModal, labelsAjusteEstoque } from './EstoqueAjusteModal'

type ModalState =
  | null
  | {
      produtoId: string
      nome: string
      quantidadeAtual: number
      estoqueMinimo: number
    }

type Props = Readonly<{
  idioma: Idioma
  filtro: 'todos' | 'baixo'
}>

function normalizaEstoqueRow(p: ProdutoComEstoqueDTO) {
  return p.estoque
}

export function EstoqueGerentePageClient({ idioma, filtro }: Props) {
  const m = getMessages(idioma)
  const [modal, setModal] = useState<ModalState>(null)

  const queryFn = useCallback(() => obterDadosEstoqueGerente(filtro), [filtro])
  const { data, loading, refetch } = useGerenteQuery(queryFn)

  const mutationOpts = useMemo(
    () => ({
      successMessage: m.comum.sucesso,
    }),
    [m.comum.sucesso],
  )

  const { mutate: salvarEstoque, loading: salvando } = useGerenteMutation(
    atualizarEstoqueProdutoThrow,
    mutationOpts,
  )

  const { mutate: criarLinhaEstoque, loading: criandoLinha } = useGerenteMutation(
    garantirLinhaEstoqueThrow,
    mutationOpts,
  )

  const somenteBaixo = filtro === 'baixo'
  const modalLabels = labelsAjusteEstoque(m)

  const exportSlot = useMemo(() => {
    if (!data) return null

    if (data.modo === 'baixo') {
      return (
        <ExportCsvButton
          label={m.gerente.exportar_csv}
          filename="gerente-estoque-baixo.csv"
          columns={[
            { key: 'nome', header: m.estoque.col_produto },
            { key: 'codigo_barras', header: m.estoque.col_codigo },
            { key: 'quantidade_atual', header: m.estoque.col_atual },
            { key: 'estoque_minimo', header: m.estoque.col_minimo },
            { key: 'deficit', header: m.estoque.col_deficit },
          ]}
          rows={
            data.linhas.map((row: EstoqueBaixoRowDTO) => ({
              nome: row.nome,
              codigo_barras: row.codigo_barras ?? '',
              quantidade_atual: row.quantidade_atual,
              estoque_minimo: row.estoque_minimo,
              deficit: row.deficit,
            }))
          }
        />
      )
    }

    if (data.modo === 'todos') {
      return (
        <ExportCsvButton
          label={m.gerente.exportar_csv}
          filename="gerente-estoque-visao-geral.csv"
          columns={[
            { key: 'nome', header: m.estoque.col_produto },
            { key: 'codigo_barras', header: m.estoque.col_codigo },
            { key: 'unidade_medida', header: m.estoque.col_unidade },
            { key: 'quantidade_atual', header: m.estoque.col_atual },
            { key: 'estoque_minimo', header: m.estoque.col_minimo },
          ]}
          rows={data.produtos.map((p) => {
            const e = normalizaEstoqueRow(p)
            return {
              nome: p.nome,
              codigo_barras: p.codigo_barras ?? '',
              unidade_medida: p.unidade_medida,
              quantidade_atual: e ? e.quantidade_atual : '',
              estoque_minimo: e ? e.estoque_minimo : '',
            }
          })}
        />
      )
    }

    return null
  }, [data, m])

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.estoque.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">{m.estoque.subtitulo}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <GerenteNavLink href="/gerente/estoque" active={!somenteBaixo}>
          {m.estoque.nav_todos}
        </GerenteNavLink>
        <GerenteNavLink href="/gerente/estoque?filtro=baixo" active={somenteBaixo}>
          {m.estoque.nav_baixo}
        </GerenteNavLink>
      </div>

      <div className="mb-4 flex justify-end">{loading ? null : exportSlot}</div>

      {loading && !data ? <p className="gerente-fin-muted text-sm">{m.comum.carregando}</p> : null}

      {somenteBaixo && data?.modo === 'baixo' ? (
        <>
          <GerenteTable
            tone="dragon"
            columns={[
              { key: 'p', header: m.estoque.col_produto },
              { key: 'c', header: m.estoque.col_codigo },
              { key: 'a', header: m.estoque.col_atual },
              { key: 'm', header: m.estoque.col_minimo },
              { key: 'd', header: m.estoque.col_deficit },
              { key: 's', header: m.produtos.status },
            ]}
          >
            {data.linhas.length === 0 ? (
              <tr>
                <td colSpan={6} className="gerente-fin-empty px-3 py-4 text-sm">
                  {m.estoque.vazio_baixo}
                </td>
              </tr>
            ) : (
              data.linhas.map((row) => (
                <tr key={row.id} className="gerente-fin-row-hover transition-colors">
                  <td className="gerente-fin-cell px-3 py-2.5">{row.nome}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{row.codigo_barras ?? '—'}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{fmtQuantidadeEstoque(row.quantidade_atual)}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{fmtQuantidadeEstoque(row.estoque_minimo)}</td>
                  <td className="gerente-caixa-diff-warn px-3 py-2.5 font-semibold">
                    {fmtQuantidadeEstoque(row.deficit)}
                  </td>
                  <td className="px-3 py-2.5">
                    <GerenteStatusBadge status="ALERTA" label={m.estoque.badge_alerta} />
                  </td>
                </tr>
              ))
            )}
          </GerenteTable>
          <p className="gerente-fin-muted mt-3 text-xs">{m.estoque.dica_baixo}</p>
        </>
      ) : null}

      {!somenteBaixo && data?.modo === 'todos' ? (
        <GerenteTable
          tone="dragon"
          columns={[
            { key: 'p', header: m.estoque.col_produto },
            { key: 'c', header: m.estoque.col_codigo },
            { key: 'u', header: m.estoque.col_unidade },
            { key: 's', header: m.produtos.status },
            { key: 'a', header: m.estoque.col_ajuste },
          ]}
        >
          {data.produtos.length === 0 ? (
            <tr>
              <td colSpan={5} className="gerente-fin-empty px-3 py-4 text-sm">
                {m.estoque.vazio_geral}
              </td>
            </tr>
          ) : (
            data.produtos.map((p) => {
              const e = normalizaEstoqueRow(p)
              const abaixo =
                e != null && Number(e.quantidade_atual) <= Number(e.estoque_minimo)
              return (
                <tr key={p.id} className="gerente-fin-row-hover transition-colors">
                  <td className="gerente-fin-cell px-3 py-2.5">{p.nome}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{p.codigo_barras ?? '—'}</td>
                  <td className="gerente-fin-cell px-3 py-2.5">{p.unidade_medida}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <GerenteStatusBadge status="ATIVO" label={m.produtos.ativo} />
                      {abaixo ? (
                        <GerenteStatusBadge status="ALERTA" label={m.estoque.badge_alerta} />
                      ) : null}
                    </div>
                  </td>
                  <td className="min-w-[200px] px-3 py-2.5">
                    {e ? (
                      <button
                        type="button"
                        disabled={salvando || criandoLinha}
                        onClick={() =>
                          setModal({
                            produtoId: p.id,
                            nome: p.nome,
                            quantidadeAtual: e.quantidade_atual,
                            estoqueMinimo: e.estoque_minimo,
                          })
                        }
                        className="rounded-lg bg-gradient-to-b from-emerald-600 to-emerald-800 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-[filter] hover:from-emerald-500 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {m.estoque.col_ajuste}
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="gerente-fin-empty text-sm">{m.estoque.sem_linha}</span>
                        <button
                          type="button"
                          disabled={salvando || criandoLinha}
                          onClick={async () => {
                            const r = await criarLinhaEstoque({ produto_id: p.id })
                            if (r !== null) await refetch()
                          }}
                          className="gerente-chip-action rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          {m.estoque.inicializar_estoque}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </GerenteTable>
      ) : null}

      {modal ? (
        <EstoqueAjusteModal
          key={modal.produtoId}
          open
          produtoId={modal.produtoId}
          produtoNome={modal.nome}
          quantidadeAtual={modal.quantidadeAtual}
          estoqueMinimo={modal.estoqueMinimo}
          saving={salvando}
          labels={modalLabels}
          onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            const r = await salvarEstoque(payload)
            if (r !== null) {
              await refetch()
              setModal(null)
            }
          }}
        />
      ) : null}
    </div>
  )
}
