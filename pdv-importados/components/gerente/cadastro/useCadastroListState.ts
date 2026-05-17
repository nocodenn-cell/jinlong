'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'

type ListResult<R> = { success: true; data: { rows: R[]; total: number } } | { success: false; error: string }

type ModalState<R> =
  | { tipo: 'fechado' }
  | { tipo: 'criar' }
  | { tipo: 'editar'; row: R }

export type { ModalState as CadastroModalState }

type Config<R, F, I> = {
  inicial: { rows: R[]; total: number }
  filtrosInicial: F
  toInput: (f: F) => I
  listarAction: (input: I) => Promise<ListResult<R>>
  toggleAtivoAction: (id: string, ativo: boolean) => Promise<{ success: boolean; error?: string }>
  labels: { situacao_atualizada: string }
}

export function useCadastroListState<R extends { id: string; ativo: boolean }, F, I>(config: Config<R, F, I>) {
  const router = useRouter()

  const [rows, setRows] = useState<R[]>(config.inicial.rows)
  const [total, setTotal] = useState(config.inicial.total)
  const [filtros, setFiltros] = useState<F>(config.filtrosInicial)
  const [filtrosAplicados, setFiltrosAplicados] = useState<F>(config.filtrosInicial)
  const [loadingList, setLoadingList] = useState(false)
  const [modal, setModal] = useState<ModalState<R>>({ tipo: 'fechado' })
  const [rowParaExcluir, setRowParaExcluir] = useState<R | null>(null)

  const fetchList = useCallback(async (f: F) => {
    setLoadingList(true)
    try {
      const r = await config.listarAction(config.toInput(f))
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setRows(r.data.rows)
      setTotal(r.data.total)
    } finally {
      setLoadingList(false)
    }
  }, [config])

  const refetch = useCallback(() => {
    void fetchList(filtrosAplicados)
    router.refresh()
  }, [fetchList, filtrosAplicados, router])

  const handleFiltrar = useCallback(() => {
    setFiltrosAplicados(filtros)
    void fetchList(filtros)
  }, [filtros, fetchList])

  const handleLimpar = useCallback(() => {
    setFiltros(config.filtrosInicial)
    setFiltrosAplicados(config.filtrosInicial)
    void fetchList(config.filtrosInicial)
  }, [fetchList, config.filtrosInicial])

  const { mutate: toggleAtivo } = useGerenteMutation(
    async (row: R) => {
      const r = await config.toggleAtivoAction(row.id, !row.ativo)
      if (!r.success) throw new Error(r.error)
      refetch()
      return null
    },
    { successMessage: config.labels.situacao_atualizada },
  )

  return {
    rows,
    total,
    filtros,
    setFiltros,
    loadingList,
    modal,
    setModal,
    rowParaExcluir,
    setRowParaExcluir,
    refetch,
    handleFiltrar,
    handleLimpar,
    toggleAtivo,
  }
}
