'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { ExportCsvButton } from '@/components/gerente/ExportCsvButton'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStatusBadge } from '@/components/gerente/GerenteStatusBadge'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { fmtQuantidadeEstoque } from '@/lib/format/fmtQuantidadeEstoque'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { useGerenteQuery } from '@/lib/hooks/useGerenteQuery'
import type { Idioma } from '@/src/lib/idioma/normalizeIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
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

  const navLink = (href: string, active: boolean, label: string) => (
    <Link
      href={href}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        fontSize: 13,
        textDecoration: 'none',
        background: active ? '#111827' : '#f3f4f6',
        color: active ? '#fff' : '#111827',
        border: active ? 'none' : '1px solid #e5e7eb',
      }}
    >
      {label}
    </Link>
  )

  const somenteBaixo = filtro === 'baixo'
  const modalLabels = labelsAjusteEstoque(m)

  const exportSlot =
    data?.modo === 'baixo' ? (
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
    ) : data?.modo === 'todos' ? (
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
    ) : null

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <GerenteFilterBar title={m.estoque.titulo} />
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>{m.estoque.subtitulo}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {navLink('/gerente/estoque', !somenteBaixo, m.estoque.nav_todos)}
        {navLink('/gerente/estoque?filtro=baixo', somenteBaixo, m.estoque.nav_baixo)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {loading ? null : exportSlot}
      </div>

      {loading && !data ? (
        <p style={{ color: '#6b7280' }}>{m.comum.carregando}</p>
      ) : null}

      {somenteBaixo && data?.modo === 'baixo' ? (
        <>
          <GerenteTable
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
                <td colSpan={6} style={{ padding: 12, color: '#6b7280' }}>
                  {m.estoque.vazio_baixo}
                </td>
              </tr>
            ) : (
              data.linhas.map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10 }}>{row.nome}</td>
                  <td style={{ padding: 10 }}>{row.codigo_barras ?? '—'}</td>
                  <td style={{ padding: 10 }}>{fmtQuantidadeEstoque(row.quantidade_atual)}</td>
                  <td style={{ padding: 10 }}>{fmtQuantidadeEstoque(row.estoque_minimo)}</td>
                  <td style={{ padding: 10, color: '#b45309', fontWeight: 600 }}>
                    {fmtQuantidadeEstoque(row.deficit)}
                  </td>
                  <td style={{ padding: 10 }}>
                    <GerenteStatusBadge status="ALERTA" label={m.estoque.badge_alerta} />
                  </td>
                </tr>
              ))
            )}
          </GerenteTable>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 12 }}>{m.estoque.dica_baixo}</p>
        </>
      ) : null}

      {!somenteBaixo && data?.modo === 'todos' ? (
        <GerenteTable
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
              <td colSpan={5} style={{ padding: 12, color: '#6b7280' }}>
                {m.estoque.vazio_geral}
              </td>
            </tr>
          ) : (
            data.produtos.map((p) => {
              const e = normalizaEstoqueRow(p)
              const abaixo =
                e != null && Number(e.quantidade_atual) <= Number(e.estoque_minimo)
              return (
                <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 10 }}>{p.nome}</td>
                  <td style={{ padding: 10 }}>{p.codigo_barras ?? '—'}</td>
                  <td style={{ padding: 10 }}>{p.unidade_medida}</td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <GerenteStatusBadge status="ATIVO" label={m.produtos.ativo} />
                      {abaixo ? (
                        <GerenteStatusBadge status="ALERTA" label={m.estoque.badge_alerta} />
                      ) : null}
                    </div>
                  </td>
                  <td style={{ padding: 10, minWidth: 200 }}>
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
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#111827',
                          color: '#fff',
                          fontSize: 13,
                          cursor: salvando || criandoLinha ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {m.estoque.col_ajuste}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#6b7280', fontSize: 13 }}>{m.estoque.sem_linha}</span>
                        <button
                          type="button"
                          disabled={salvando || criandoLinha}
                          onClick={async () => {
                            const r = await criarLinhaEstoque({ produto_id: p.id })
                            if (r !== null) await refetch()
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            background: '#fff',
                            fontSize: 13,
                            cursor: salvando || criandoLinha ? 'not-allowed' : 'pointer',
                          }}
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
