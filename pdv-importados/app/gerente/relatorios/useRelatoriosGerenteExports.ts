'use client'

import { useMemo } from 'react'
import { downloadXlsx } from '@/lib/xlsx'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import type { Mensagens } from '@/i18n/getMessages'
import type { RelatoriosGerentePayload } from '@/app/gerente/relatorios/actions'
import { downloadCsv } from '@/app/gerente/relatorios/relatoriosGerenteUtils'

type Col = { key: string; header: string }

export function useRelatoriosGerenteExports(
  m: Mensagens,
  data: RelatoriosGerentePayload | null,
  csvSuffix: string,
  vendasDiaColumns: Col[],
  topProdutosColumns: Col[],
  estoqueBaixoColumns: Col[],
) {
  const exportVendasOpts = useMemo(() => ({ successMessage: m.comum.sucesso }), [m.comum.sucesso])

  const { mutate: exportVendasDia, loading: expVendas } = useGerenteMutation(
    async () => {
      if (!data) throw new Error('Sem dados')
      downloadCsv(
        `relatorio-vendas-dia_${csvSuffix}.csv`,
        vendasDiaColumns,
        data.porDia.map((row) => ({
          dia: row.dia ? String(row.dia).slice(0, 10) : '',
          num_vendas: row.num_vendas,
          total_liquido: Number(row.total_liquido),
          ticket_medio: Number(row.ticket_medio),
          total_desconto: Number(row.total_desconto),
        })),
      )
      return null
    },
    exportVendasOpts,
  )

  const { mutate: exportVendasDiaXlsx, loading: expVendasXlsx } = useGerenteMutation(
    async () => {
      if (!data) throw new Error('Sem dados')
      downloadXlsx(
        `relatorio-vendas-dia_${csvSuffix}.xlsx`,
        vendasDiaColumns,
        data.porDia.map((row) => ({
          dia: row.dia ? String(row.dia).slice(0, 10) : '',
          num_vendas: row.num_vendas,
          total_liquido: Number(row.total_liquido),
          ticket_medio: Number(row.ticket_medio),
          total_desconto: Number(row.total_desconto),
        })),
      )
      return null
    },
    exportVendasOpts,
  )

  const { mutate: exportTop, loading: expTop } = useGerenteMutation(
    async () => {
      if (!data) throw new Error('Sem dados')
      downloadCsv(
        `relatorio-top-produtos_${csvSuffix}.csv`,
        topProdutosColumns,
        data.top.map((row) => ({
          id: row.id,
          nome: row.nome,
          origem: row.origem,
          total_quantidade: row.total_quantidade,
          total_valor: row.total_valor,
          num_vendas: row.num_vendas,
        })),
      )
      return null
    },
    exportVendasOpts,
  )

  const { mutate: exportTopXlsx, loading: expTopXlsx } = useGerenteMutation(
    async () => {
      if (!data) throw new Error('Sem dados')
      downloadXlsx(
        `relatorio-top-produtos_${csvSuffix}.xlsx`,
        topProdutosColumns,
        data.top.map((row) => ({
          id: row.id,
          nome: row.nome,
          origem: row.origem,
          total_quantidade: row.total_quantidade,
          total_valor: row.total_valor,
          num_vendas: row.num_vendas,
        })),
      )
      return null
    },
    exportVendasOpts,
  )

  const { mutate: exportBaixo, loading: expBaixo } = useGerenteMutation(
    async () => {
      if (!data) throw new Error('Sem dados')
      downloadCsv(
        'relatorio-estoque-baixo.csv',
        estoqueBaixoColumns,
        data.baixo.map((row) => ({
          nome: row.nome,
          codigo_barras: row.codigo_barras ?? '',
          quantidade_atual: row.quantidade_atual,
          estoque_minimo: row.estoque_minimo,
          deficit: row.deficit,
        })),
      )
      return null
    },
    exportVendasOpts,
  )

  const { mutate: exportBaixoXlsx, loading: expBaixoXlsx } = useGerenteMutation(
    async () => {
      if (!data) throw new Error('Sem dados')
      downloadXlsx(
        'relatorio-estoque-baixo.xlsx',
        estoqueBaixoColumns,
        data.baixo.map((row) => ({
          nome: row.nome,
          codigo_barras: row.codigo_barras ?? '',
          quantidade_atual: row.quantidade_atual,
          estoque_minimo: row.estoque_minimo,
          deficit: row.deficit,
        })),
      )
      return null
    },
    exportVendasOpts,
  )

  return {
    exportVendasDia,
    expVendas,
    exportVendasDiaXlsx,
    expVendasXlsx,
    exportTop,
    expTop,
    exportTopXlsx,
    expTopXlsx,
    exportBaixo,
    expBaixo,
    exportBaixoXlsx,
    expBaixoXlsx,
  }
}
