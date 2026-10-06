'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageMinus, PackagePlus, SlidersHorizontal } from 'lucide-react'
import { OperationalQuickActions } from '@/components/ui/OperationalQuickActions'
import { ROUTES } from '@/lib/navigation/routes'
import { AjusteSaldoModal, type AjusteAlvo } from './AjusteSaldoModal'
import type { EstoqueLinha } from './EstoqueTable'

const textos = {
  pt: {
    title: 'Ações rápidas',
    entrada: 'Entrada de mercadoria',
    retirar: 'Retirar do estoque',
    ajustar: 'Ajustar quantidade',
    escolher: 'Escolha o produto',
    fechar: 'Fechar',
    retirarAjuda: 'Retirada registra saída com motivo. Não inativa nem exclui o produto.',
    ajustarAjuda: 'Informe a contagem. A diferença e o motivo ficam no kardex.',
  },
  zh: {
    title: '快捷操作',
    entrada: '商品入库',
    retirar: '出库',
    ajustar: '调整数量',
    escolher: '选择商品',
    fechar: '关闭',
    retirarAjuda: '出库会记录原因，不会停用或删除商品。',
    ajustarAjuda: '录入盘点数量，差异与原因写入库存流水。',
  },
} as const

type Props = {
  idioma?: 'pt' | 'zh'
  linhas: EstoqueLinha[]
  ajusteLabels: {
    titulo: string
    saldoAtual: string
    estoqueMinimo: string
    motivo: string
    observacao: string
    cancelar: string
    salvar: string
    salvando: string
    motivos: Array<{ value: string; label: string }>
  }
}

export function EstoqueQuickActions({ idioma = 'pt', linhas, ajusteLabels }: Props) {
  const router = useRouter()
  const t = textos[idioma]
  const [modo, setModo] = useState<'retirar' | 'ajustar' | null>(null)
  const [produtoId, setProdutoId] = useState('')
  const [alvo, setAlvo] = useState<AjusteAlvo | null>(null)

  const motivos = useMemo(() => {
    if (modo === 'retirar') {
      return ajusteLabels.motivos.filter((m) => ['PERDA', 'QUEBRA', 'OUTRO'].includes(m.value))
    }
    return ajusteLabels.motivos.filter((m) => ['ACERTO_INVENTARIO', 'OUTRO'].includes(m.value))
  }, [ajusteLabels.motivos, modo])

  function confirmarProduto() {
    const row = linhas.find((l) => l.id === produtoId)
    if (!row) return
    setAlvo({
      produtoId: row.id,
      produtoNome: row.nome,
      quantidadeAtual: row.quantidade_atual ?? 0,
      estoqueMinimo: row.estoque_minimo ?? 0,
    })
    setModo(null)
  }

  return (
    <>
      <OperationalQuickActions
        title={t.title}
        actions={[
          {
            id: 'entrada',
            label: t.entrada,
            icon: <PackagePlus />,
            onClick: () => router.push(ROUTES.admin.estoqueRecebimento),
          },
          {
            id: 'retirar',
            label: t.retirar,
            icon: <PackageMinus />,
            onClick: () => { setProdutoId(''); setModo('retirar') },
          },
          {
            id: 'ajustar',
            label: t.ajustar,
            icon: <SlidersHorizontal />,
            onClick: () => { setProdutoId(''); setModo('ajustar') },
          },
        ]}
      />

      {modo ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center"
          onClick={() => setModo(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-[var(--color-surface)] p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{modo === 'retirar' ? t.retirar : t.ajustar}</h2>
              <button type="button" className="admin-v2-btn-secondary" onClick={() => setModo(null)}>{t.fechar}</button>
            </div>
            <p className="mb-3 text-small text-jl-fg-3">{modo === 'retirar' ? t.retirarAjuda : t.ajustarAjuda}</p>
            <label className="grid gap-1 text-small">
              {t.escolher}
              <select
                className="fp-control min-h-[56px] text-[18px]"
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
              >
                <option value="">—</option>
                {linhas.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome} · {l.quantidade_atual ?? 0}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="admin-v2-btn-primary mt-4 h-14 min-h-[56px] w-full text-[18px]"
              disabled={!produtoId}
              onClick={confirmarProduto}
            >
              Continuar
            </button>
          </div>
        </div>
      ) : null}

      <AjusteSaldoModal
        alvo={alvo}
        onClose={() => setAlvo(null)}
        labels={{ ...ajusteLabels, motivos: motivos.length ? motivos : ajusteLabels.motivos }}
      />
    </>
  )
}
