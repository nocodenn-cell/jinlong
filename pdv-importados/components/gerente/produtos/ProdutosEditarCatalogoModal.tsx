'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { atualizarDadosProdutoGerente } from '@/app/gerente/produtos/actions'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'

type OrigemCode = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'
type UnidadeCode = 'UN' | 'KG' | 'CX' | 'FD' | 'M'

export type ProdutosEditarCatalogoModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  produto: ProdutoGerenteRow | null
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  onSalvo: () => void
}>

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3 first:mt-0">
      {children}
    </p>
  )
}

export function ProdutosEditarCatalogoModal({
  open,
  onOpenChange,
  produto,
  m,
  opcoes,
  onSalvo,
}: ProdutosEditarCatalogoModalProps) {
  const p = m.produtos

  // --- identificação ---
  const [nome, setNome] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [temNf, setTemNf] = useState(false)

  // --- precificação ---
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [precoAtacado, setPrecoAtacado] = useState('')
  const [qtdGatilho, setQtdGatilho] = useState('')

  // --- medida + complementar ---
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeCode>('UN')
  const [observacao, setObservacao] = useState('')

  // --- classificação ---
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')

  const [saving, setSaving] = useState(false)

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open || !produto) return
    setNome(produto.nome)
    setCodigoBarras(produto.codigo_barras ?? '')
    setOrigem(produto.origem as OrigemCode)
    setTemNf(produto.tem_nf)
    setPrecoVarejo(String(produto.preco_varejo))
    setPrecoAtacado(produto.preco_atacado != null ? String(produto.preco_atacado) : '')
    setQtdGatilho(produto.quantidade_gatilho_atacado != null ? String(produto.quantidade_gatilho_atacado) : '')
    setUnidadeMedida((produto.unidade_medida as UnidadeCode) || 'UN')
    setObservacao(produto.observacao ?? '')
    setCategoriaId(produto.categoria_id ?? '')
    setMarcaId(produto.marca_id ?? '')
    setFornecedorId(produto.fornecedor_id ?? '')
  }, [open, produto])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault()
        fechar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, fechar, saving])

  const salvar = useCallback(async () => {
    if (!produto) return
    setSaving(true)
    try {
      const precoVarejoNum = parseFloat(precoVarejo.replace(',', '.'))
      const precoAtacadoNum = precoAtacado.trim()
        ? parseFloat(precoAtacado.replace(',', '.'))
        : null
      const qtdGatilhoNum = qtdGatilho.trim() ? parseInt(qtdGatilho, 10) : null

      const r = await atualizarDadosProdutoGerente({
        produto_id: produto.id,
        nome: nome.trim(),
        codigo_barras: codigoBarras.trim(),
        origem,
        tem_nf: temNf,
        preco_varejo: precoVarejoNum,
        preco_atacado: precoAtacadoNum,
        quantidade_gatilho_atacado: qtdGatilhoNum,
        unidade_medida: unidadeMedida,
        observacao: observacao.trim() || null,
        categoria_id: categoriaId || null,
        marca_id: marcaId || null,
        fornecedor_id: fornecedorId || null,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
      onSalvo()
      fechar()
    } finally {
      setSaving(false)
    }
  }, [
    produto, nome, codigoBarras, origem, temNf,
    precoVarejo, precoAtacado, qtdGatilho,
    unidadeMedida, observacao,
    categoriaId, marcaId, fornecedorId,
    m.comum.sucesso, onSalvo, fechar,
  ])

  if (!open || !produto) return null

  const finIn = 'h-9 w-full rounded-md px-3 text-xs app-input'
  const finInMono = `${finIn} font-mono`
  const finSelect = 'h-9 w-full rounded-md px-3 text-xs app-select'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 dragon-glass-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) fechar()
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="produtos-editar-catalogo-titulo"
        className="dragon-glass-card flex max-h-[90vh] w-full max-w-lg flex-col rounded-none border shadow-xl sm:rounded-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b border-jl-border-1 px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-2">
            <Pencil className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
            <CardTitle id="produtos-editar-catalogo-titulo" className="text-lg font-semibold text-jl-fg-1">
              {p.editar_modal_titulo}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto px-4 py-4 sm:px-6">

          {/* ── Identificação ── */}
          <SectionTitle>{p.secao_identificacao}</SectionTitle>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.nome}
              <input
                className={`${finIn} mt-1`}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.codigo_barras}
              <input
                className={`${finInMono} mt-1`}
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                disabled={saving}
                placeholder={p.codigo_barras_opcional}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-jl-fg-3">
                {p.origem_label}
                <select
                  className={`${finSelect} mt-1`}
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value as OrigemCode)}
                  disabled={saving}
                >
                  <option value="china_manual">{p.origem_china}</option>
                  <option value="brasil_nf">{p.origem_brasil_nf}</option>
                  <option value="brasil_sem_nf">{p.origem_brasil_sem_nf}</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-jl-fg-3">
                {p.unidade_medida}
                <select
                  className={`${finSelect} mt-1`}
                  value={unidadeMedida}
                  onChange={(e) => setUnidadeMedida(e.target.value as UnidadeCode)}
                  disabled={saving}
                >
                  <option value="UN">{p.unidade_medida_un}</option>
                  <option value="KG">{p.unidade_medida_kg}</option>
                  <option value="CX">{p.unidade_medida_cx}</option>
                  <option value="FD">{p.unidade_medida_fd}</option>
                  <option value="M">{p.unidade_medida_m}</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs text-jl-fg-1">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded app-border app-surface-soft"
                checked={temNf}
                onChange={(e) => setTemNf(e.target.checked)}
                disabled={saving}
              />
              {p.tem_nf}
            </label>
          </div>

          {/* ── Precificação ── */}
          <SectionTitle>{p.secao_precificacao}</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.preco_varejo}
              <input
                type="text"
                inputMode="decimal"
                className={`${finInMono} mt-1`}
                value={precoVarejo}
                onChange={(e) => setPrecoVarejo(e.target.value)}
                disabled={saving}
              />
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.preco_atacado}
              <input
                type="text"
                inputMode="decimal"
                className={`${finInMono} mt-1`}
                value={precoAtacado}
                onChange={(e) => setPrecoAtacado(e.target.value)}
                disabled={saving}
                placeholder="—"
              />
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.qtd_gatilho_atacado}
              <input
                type="text"
                inputMode="numeric"
                className={`${finInMono} mt-1`}
                value={qtdGatilho}
                onChange={(e) => setQtdGatilho(e.target.value)}
                disabled={saving}
                placeholder="—"
              />
            </label>
          </div>

          {/* ── Classificação ── */}
          <SectionTitle>{p.secao_classificacao}</SectionTitle>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.categoria_label}
              <select
                className={`${finSelect} mt-1`}
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                disabled={saving}
              >
                <option value="">{p.nenhuma_categoria}</option>
                {opcoes.categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-jl-fg-3">
                {p.marca_label}
                <select
                  className={`${finSelect} mt-1`}
                  value={marcaId}
                  onChange={(e) => setMarcaId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">{p.nenhuma_marca}</option>
                  {opcoes.marcas.map((mr) => (
                    <option key={mr.id} value={mr.id}>{mr.nome}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-jl-fg-3">
                {p.fornecedor_label}
                <select
                  className={`${finSelect} mt-1`}
                  value={fornecedorId}
                  onChange={(e) => setFornecedorId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">{p.nenhum_fornecedor}</option>
                  {opcoes.fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* ── Complementar ── */}
          <SectionTitle>{p.secao_complementar}</SectionTitle>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.observacao}
            <textarea
              rows={3}
              className="mt-1 w-full resize-none rounded-md px-3 py-2 text-xs app-input"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={saving}
              placeholder="—"
            />
          </label>

        </CardContent>

        <CardFooter className="flex justify-end gap-2 border-t border-jl-border-1 px-4 py-3 sm:px-6">
          <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={saving}>
            {m.comum.cancelar}
          </Button>
          <Button type="button" className="app-btn-accent" disabled={saving} onClick={() => void salvar()}>
            {saving ? '…' : p.editar_modal_salvar}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
