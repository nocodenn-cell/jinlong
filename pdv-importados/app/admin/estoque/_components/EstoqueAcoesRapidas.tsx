'use client'

/**
 * Faixa fixa de ações rápidas do Estoque.
 * Reutiliza recebimento, importação NF-e e ajuste existing — sem gerar pagamento automático.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PackageMinus, PackagePlus, SlidersHorizontal } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { ROUTES } from '@/lib/navigation/routes'
import { obterListaEstoqueGerente } from '@/app/gerente/estoque/actions'
import { AjusteSaldoModal, type AjusteAlvo, type AjusteModo } from './AjusteSaldoModal'
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
  quantidadeRetirar: string
  quantidadeContada: string
  saldoAnterior: string
  referenciaDoc: string
  referenciaDocHint: string
  confirmarRetirada: string
  confirmarAjuste: string
  erroRetiradaInvalida: string
  erroRetiradaExcede: string
  erroConcorrencia: string
  codigoLabel: string
  unidadeLabel: string
  produtoLabel: string
  resumoTitulo: string
  resumoSaldoAtual: string
  resumoRetirada: string
  resumoSaldoApos: string
  resumoSistema: string
  resumoContagem: string
  resumoDiferenca: string
  resumoNovoSaldo: string
}

type Props = {
  linhas: EstoqueLinha[]
  labels: EstoqueLabels
  quick: QuickLabels
}

const BTN =
  'inline-flex min-h-14 min-w-[9.5rem] flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-elev px-3 text-[18px] font-semibold text-jl-fg-1 shadow-sm transition hover:bg-jl-surface-soft focus-visible:outline-none focus-visible:shadow-focus sm:flex-none'

function motivosPorModo(modo: AjusteModo, labels: EstoqueLabels) {
  if (modo === 'retirar') {
    return [
      { value: 'PERDA', label: labels.motivoPerda },
      { value: 'QUEBRA', label: labels.motivoQuebra },
      { value: 'OUTRO', label: labels.motivoOutro },
    ]
  }
  if (modo === 'ajustar') {
    return [
      { value: 'ACERTO_INVENTARIO', label: labels.motivoAcertoInventario },
      { value: 'OUTRO', label: labels.motivoOutro },
    ]
  }
  return [
    { value: 'ACERTO_INVENTARIO', label: labels.motivoAcertoInventario },
    { value: 'COMPRA', label: labels.motivoEntradaCompra },
    { value: 'PERDA', label: labels.motivoPerda },
    { value: 'QUEBRA', label: labels.motivoQuebra },
    { value: 'OUTRO', label: labels.motivoOutro },
  ]
}

export function EstoqueAcoesRapidas({ linhas, labels, quick }: Props) {
  const [painel, setPainel] = useState<'entrada' | 'retirar' | 'ajustar' | null>(null)
  const [busca, setBusca] = useState('')
  const [ajusteAlvo, setAjusteAlvo] = useState<AjusteAlvo | null>(null)
  const [buscaRemota, setBuscaRemota] = useState<{ q: string; linhas: EstoqueLinha[] } | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState(false)

  // A lista principal é paginada: a busca da operação deve consultar TODOS os produtos da loja.
  useEffect(() => {
    if (painel !== 'retirar' && painel !== 'ajustar') return
    let ativo = true
    const q = busca.trim().slice(0, 200)
    setBuscando(true)
    setErroBusca(false)
    const timer = setTimeout(async () => {
      try {
        const resultado = await obterListaEstoqueGerente({ visao: 'geral', busca: q, limite: 12, offset: 0 })
        if (ativo) setBuscaRemota({ q, linhas: resultado.rows })
      } catch {
        if (ativo) setErroBusca(true)
      } finally {
        if (ativo) setBuscando(false)
      }
    }, 250)
    return () => { ativo = false; clearTimeout(timer) }
  }, [painel, busca])

  const filtrados = buscaRemota?.q === busca.trim().slice(0, 200) ? buscaRemota.linhas : linhas
    .filter((l) => {
      const q = busca.trim().toLowerCase()
      if (!q) return true
      return l.nome.toLowerCase().includes(q) || (l.codigo_barras ?? '').toLowerCase().includes(q)
    })
    .slice(0, 12)

  function abrirAjuste(linha: EstoqueLinha, modo: 'retirar' | 'ajustar') {
    setPainel(null)
    setBusca('')
    setAjusteAlvo({
      produtoId: linha.id,
      produtoNome: linha.nome,
      quantidadeAtual: linha.quantidade_atual ?? 0,
      estoqueMinimo: linha.estoque_minimo ?? 0,
      codigoBarras: linha.codigo_barras,
      unidade: linha.unidade_medida,
      modo,
    })
  }

  const modoAtivo: AjusteModo = ajusteAlvo?.modo ?? 'generico'
  const ajusteLabels = {
    titulo:
      modoAtivo === 'retirar'
        ? quick.retirarTitulo
        : modoAtivo === 'ajustar'
          ? quick.ajustarTitulo
          : labels.ajusteTitulo,
    saldoAtual: labels.saldoAtual,
    estoqueMinimo: labels.estoqueMinimo,
    motivo: labels.motivo,
    observacao: labels.observacao,
    cancelar: labels.cancelar,
    salvar: labels.salvarAjuste,
    salvando: labels.salvando,
    motivos: motivosPorModo(modoAtivo, labels),
    quantidadeRetirar: quick.quantidadeRetirar,
    quantidadeContada: quick.quantidadeContada,
    saldoAnterior: quick.saldoAnterior,
    referenciaDoc: quick.referenciaDoc,
    referenciaDocHint: quick.referenciaDocHint,
    confirmarRetirada: quick.confirmarRetirada,
    confirmarAjuste: quick.confirmarAjuste,
    erroRetiradaInvalida: quick.erroRetiradaInvalida,
    erroRetiradaExcede: quick.erroRetiradaExcede,
    erroConcorrencia: quick.erroConcorrencia,
    codigoLabel: quick.codigoLabel,
    unidadeLabel: quick.unidadeLabel,
    produtoLabel: quick.produtoLabel,
    resumoTitulo: quick.resumoTitulo,
    resumoSaldoAtual: quick.resumoSaldoAtual,
    resumoRetirada: quick.resumoRetirada,
    resumoSaldoApos: quick.resumoSaldoApos,
    resumoSistema: quick.resumoSistema,
    resumoContagem: quick.resumoContagem,
    resumoDiferenca: quick.resumoDiferenca,
    resumoNovoSaldo: quick.resumoNovoSaldo,
  }

  return (
    <>
      <div
        className="sticky top-0 z-20 mb-4 border-b border-[var(--color-border-secondary)] bg-[color-mix(in_srgb,var(--jl-surface-base)_95%,transparent)] py-3 backdrop-blur"
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
        onClose={() => {
          setPainel(null)
          setBusca('')
        }}
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
        {buscando ? <p role="status" className="mt-3 text-caption text-jl-fg-3">{labels.situacaoSemLinha ? '' : ''}{quick.buscarPlaceholder}…</p> : null}
        {erroBusca ? <p role="alert" className="mt-3 text-caption text-[var(--color-warning-strong)]">{quick.selecionarProduto}</p> : null}
        <ul aria-busy={buscando} className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {filtrados.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--color-border-secondary)] px-3 py-3 text-left text-[16px] hover:bg-jl-surface-soft focus-visible:outline-none focus-visible:shadow-focus"
                onClick={() => abrirAjuste(l, painel === 'retirar' ? 'retirar' : 'ajustar')}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.nome}</span>
                  <span className="font-mono text-caption text-jl-fg-3">
                    {l.codigo_barras ?? '—'}
                    {l.unidade_medida ? ` · ${l.unidade_medida}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block tabular-nums text-jl-fg-1">{l.quantidade_atual ?? 0}</span>
                  <span className="block text-caption text-jl-fg-3">
                    mín. {l.estoque_minimo ?? 0}
                  </span>
                </span>
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
