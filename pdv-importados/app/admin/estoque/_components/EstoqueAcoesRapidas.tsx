'use client'

/**
 * Faixa fixa de ações rápidas do Estoque.
 * Reutiliza recebimento, importação NF-e e ajuste existing — sem gerar pagamento automático.
 */

import { useState } from 'react'
import Link from 'next/link'
import { PackageMinus, PackagePlus, SlidersHorizontal } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { ROUTES } from '@/lib/navigation/routes'
import { AjusteSaldoModal, type AjusteAlvo } from './AjusteSaldoModal'
import type { EstoqueLinha, EstoqueLabels } from './EstoqueTable'

type QuickLabels = {
  faixaAria: string
  entrada: string
  retirar: string
  ajustar: string
  entradaTitulo: string
  entradaTexto: string
  entradaNfe: string
  entradaManual: string
  retirarTitulo: string
  retirarTexto: string
  ajustarTitulo: string
  ajustarTexto: string
  buscarPlaceholder: string
  selecionarProduto: string
  motivoObrigatorio: string
}

type Props = {
  linhas: EstoqueLinha[]
  labels: EstoqueLabels
  quick: QuickLabels
}

const BTN =
  'inline-flex min-h-14 min-w-[9.5rem] flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-elev px-3 text-[18px] font-semibold text-jl-fg-1 shadow-sm transition hover:bg-jl-surface-soft focus-visible:outline-none focus-visible:shadow-focus sm:flex-none'

export function EstoqueAcoesRapidas({ linhas, labels, quick }: Props) {
  const [painel, setPainel] = useState<'entrada' | 'retirar' | 'ajustar' | null>(null)
  const [busca, setBusca] = useState('')
  const [ajusteAlvo, setAjusteAlvo] = useState<AjusteAlvo | null>(null)

  const filtrados = linhas.filter((l) => {
    const q = busca.trim().toLowerCase()
    if (!q) return true
    return l.nome.toLowerCase().includes(q) || (l.codigo_barras ?? '').toLowerCase().includes(q)
  }).slice(0, 12)

  function abrirAjuste(linha: EstoqueLinha, modo: 'retirar' | 'ajustar') {
    setPainel(null)
    setAjusteAlvo({
      produtoId: linha.id,
      produtoNome: linha.nome,
      quantidadeAtual: linha.quantidade_atual ?? 0,
      estoqueMinimo: linha.estoque_minimo ?? 0,
    })
    // Motivo default via modal — retirada exige perda/quebra/consumo no formulário.
    void modo
  }

  const ajusteLabels = {
    titulo: painel === 'retirar' ? quick.retirarTitulo : labels.ajusteTitulo,
    saldoAtual: labels.saldoAtual,
    estoqueMinimo: labels.estoqueMinimo,
    motivo: labels.motivo,
    observacao: labels.observacao,
    cancelar: labels.cancelar,
    salvar: labels.salvarAjuste,
    salvando: labels.salvando,
    motivos: [
      { value: 'ACERTO_INVENTARIO', label: labels.motivoAcertoInventario },
      { value: 'ENTRADA_COMPRA', label: labels.motivoEntradaCompra },
      { value: 'PERDA', label: labels.motivoPerda },
      { value: 'QUEBRA', label: labels.motivoQuebra },
      { value: 'OUTRO', label: labels.motivoOutro },
    ],
  }

  return (
    <>
      <div
        className="sticky top-0 z-20 mb-4 border-b border-[var(--color-border-secondary)] bg-[var(--color-surface-base)]/95 py-3 backdrop-blur"
        role="toolbar"
        aria-label={quick.faixaAria}
      >
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={() => setPainel('entrada')}>
            <PackagePlus className="h-5 w-5 shrink-0" aria-hidden />
            {quick.entrada}
          </button>
          <button type="button" className={BTN} onClick={() => setPainel('retirar')}>
            <PackageMinus className="h-5 w-5 shrink-0" aria-hidden />
            {quick.retirar}
          </button>
          <button type="button" className={BTN} onClick={() => setPainel('ajustar')}>
            <SlidersHorizontal className="h-5 w-5 shrink-0" aria-hidden />
            {quick.ajustar}
          </button>
        </div>
      </div>

      <DragonModal open={painel === 'entrada'} onClose={() => setPainel(null)} title={quick.entradaTitulo} size="md">
        <p className="mb-4 text-small text-jl-fg-2">{quick.entradaTexto}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={ROUTES.admin.importNfe} className="admin-v2-btn-primary inline-flex min-h-14 items-center px-4 text-[18px]">
            {quick.entradaNfe}
          </Link>
          <Link href={ROUTES.admin.estoqueRecebimento} className="admin-v2-btn-secondary inline-flex min-h-14 items-center px-4 text-[18px]">
            {quick.entradaManual}
          </Link>
        </div>
      </DragonModal>

      <DragonModal
        open={painel === 'retirar' || painel === 'ajustar'}
        onClose={() => setPainel(null)}
        title={painel === 'retirar' ? quick.retirarTitulo : quick.ajustarTitulo}
        size="lg"
      >
        <p className="mb-3 text-small text-jl-fg-2">
          {painel === 'retirar' ? quick.retirarTexto : quick.ajustarTexto}
        </p>
        <label className="grid gap-1 text-small">
          {quick.buscarPlaceholder}
          <input
            className="fp-control"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={quick.buscarPlaceholder}
            aria-label={quick.buscarPlaceholder}
          />
        </label>
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {filtrados.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border-secondary)] px-3 py-3 text-left text-[16px] hover:bg-jl-surface-soft focus-visible:outline-none focus-visible:shadow-focus"
                onClick={() => abrirAjuste(l, painel === 'retirar' ? 'retirar' : 'ajustar')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.nome}</span>
                  <span className="font-mono text-caption text-jl-fg-3">{l.codigo_barras ?? '—'}</span>
                </span>
                <span className="shrink-0 tabular-nums text-jl-fg-2">{l.quantidade_atual ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
        {!filtrados.length ? <p className="mt-3 text-small text-jl-fg-3">{quick.selecionarProduto}</p> : null}
        {painel === 'retirar' ? <p className="mt-3 text-caption text-jl-fg-3">{quick.motivoObrigatorio}</p> : null}
      </DragonModal>

      <AjusteSaldoModal
        alvo={ajusteAlvo}
        onClose={() => setAjusteAlvo(null)}
        labels={ajusteLabels}
      />
    </>
  )
}
