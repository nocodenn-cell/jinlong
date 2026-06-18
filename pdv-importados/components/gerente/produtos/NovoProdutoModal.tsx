'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { criarProduto } from '@/app/gerente/produtos/actions'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'

type OrigemCode = 'china_manual' | 'brasil_nf'

export type NovoProdutoModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  onCriado: () => void
}>

type FaixaPreco = { qtd: string; preco: string }

function gerarSkuAleatorio() {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

function calcTotal(qtd: string, preco: string): string {
  const q = parseInt(qtd, 10)
  const p = parseFloat(preco.replace(',', '.'))
  if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) return '—'
  return `R$ ${(q * p).toFixed(2).replace('.', ',')}`
}

export function NovoProdutoModal({ open, onOpenChange, m, opcoes, onCriado }: NovoProdutoModalProps) {
  const p = m.produtos
  const nomeRef = useRef<HTMLInputElement>(null)

  // Dados do produto
  const [nome, setNome] = useState('')
  const [sku, setSku] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [descricaoCurta, setDescricaoCurta] = useState('')
  const [ativo, setAtivo] = useState(true)

  // Preço — base + faixas atacado
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [precoCusto, setPrecoCusto] = useState('')
  const [faixas, setFaixas] = useState<FaixaPreco[]>([])

  // Estoque
  const [estoqueMinimo, setEstoqueMinimo] = useState('')

  const [saving, setSaving] = useState(false)

  const fechar = useCallback(() => {
    if (saving) return
    onOpenChange(false)
  }, [saving, onOpenChange])

  useEffect(() => {
    if (!open) return
    setNome('')
    setSku('')
    setOrigem('china_manual')
    setCategoriaId('')
    setMarcaId('')
    setDescricaoCurta('')
    setAtivo(true)
    setPrecoVarejo('')
    setPrecoCusto('')
    setFaixas([])
    setEstoqueMinimo('')
    setSaving(false)
    requestAnimationFrame(() => nomeRef.current?.focus())
  }, [open])

  const adicionarFaixa = useCallback(() => {
    setFaixas((prev) => [...prev, { qtd: '', preco: '' }])
  }, [])

  const removerFaixa = useCallback((idx: number) => {
    setFaixas((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const atualizarFaixa = useCallback((idx: number, field: keyof FaixaPreco, value: string) => {
    setFaixas((prev) => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f))
  }, [])

  const salvar = useCallback(async () => {
    const nomeTrim = nome.trim()
    if (!nomeTrim) {
      emitGerenteToast({ kind: 'error', message: p.nome_obrigatorio })
      return
    }
    const precoVarejoNum = parseFloat(precoVarejo.replace(',', '.'))
    if (!precoVarejo.trim() || !Number.isFinite(precoVarejoNum) || precoVarejoNum <= 0) {
      emitGerenteToast({ kind: 'error', message: p.preco_invalido })
      return
    }

    const precoCustoNum = precoCusto.trim() ? parseFloat(precoCusto.replace(',', '.')) : null

    // Usa apenas a última faixa atacado (se houver)
    const ultimaFaixa = faixas[faixas.length - 1]
    const precoAtacadoNum = ultimaFaixa?.preco.trim()
      ? parseFloat(ultimaFaixa.preco.replace(',', '.'))
      : null
    const qtdGatilhoNum = ultimaFaixa?.qtd.trim() ? parseInt(ultimaFaixa.qtd, 10) : null

    const estoqueMin = estoqueMinimo.trim() ? parseInt(estoqueMinimo, 10) : 0

    setSaving(true)
    try {
      const r = await criarProduto({
        nome: nomeTrim,
        codigo_barras: null,
        codigo_interno: sku.trim() || null,
        origem,
        tem_nf: false,
        preco_varejo: precoVarejoNum,
        preco_atacado: precoAtacadoNum,
        preco_custo: precoCustoNum,
        quantidade_gatilho_atacado: qtdGatilhoNum,
        categoria_id: categoriaId || null,
        marca_id: marcaId || null,
        observacao: descricaoCurta.trim() || null,
        ativo,
        estoque_minimo: estoqueMin,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: p.criado_rascunho })
      onCriado()
      fechar()
    } finally {
      setSaving(false)
    }
  }, [nome, sku, origem, categoriaId, marcaId, descricaoCurta, ativo, precoVarejo, precoCusto, faixas, estoqueMinimo, p, onCriado, fechar])

  if (!open) return null

  const finIn = 'h-9 w-full rounded-md px-3 text-xs app-input !bg-white/[.08] !border-white/[.18]'
  const finInMono = `${finIn} font-mono`
  const finSelect = 'h-9 w-full rounded-md px-3 text-xs app-select !bg-white/[.08] !border-white/[.18]'

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="lg"
      icon={Plus}
      title={p.cadastro_rapido}
      subtitle={p.codigo_barras_opcional}
      dismissable={!saving}
      closeLabel={m.comum.cancelar ?? 'Cancelar'}
      footer={
        <>
          <button
            type="button"
            onClick={fechar}
            disabled={saving}
            className="h-9 rounded-md px-4 text-sm font-medium app-muted hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            {m.comum.cancelar ?? 'Cancelar'}
          </button>
          <Button
            type="button"
            onClick={() => void salvar()}
            disabled={saving}
            className="h-9 app-btn-accent px-5 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? '…' : m.comum.salvar}
          </Button>
        </>
      }
    >
      <div className="pb-1 space-y-4">

        {/* ── Dados do Produto ── */}
        <p className="text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
          {p.secao_dados_produto}
        </p>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.nome} *
            <input
              ref={nomeRef}
              className={`${finIn} mt-1`}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={saving}
              placeholder={p.nome}
              autoComplete="off"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void salvar() } }}
            />
          </label>

          {/* SKU */}
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.sku_label}
            <div className="mt-1 flex gap-2">
              <input
                className={`${finInMono} flex-1`}
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                disabled={saving}
                placeholder="AUTO"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setSku(gerarSkuAleatorio())}
                disabled={saving}
                title={p.gerar_sku}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/[.18] bg-white/[.05] text-jl-fg-3 hover:text-jl-fg-1 hover:bg-white/[.12] transition-colors disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            {opcoes.categorias.length > 0 && (
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
            )}
            {opcoes.marcas.length > 0 && (
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
            )}
          </div>

          <label className="block text-xs font-medium text-jl-fg-3">
            {p.descricao_curta_label}
            <textarea
              rows={2}
              className="mt-1 w-full resize-none rounded-md px-3 py-2 text-xs app-input !bg-white/[.08] !border-white/[.18]"
              value={descricaoCurta}
              onChange={(e) => setDescricaoCurta(e.target.value)}
              disabled={saving}
              placeholder="—"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-jl-fg-3">
            <div
              role="switch"
              aria-checked={ativo}
              onClick={() => !saving && setAtivo((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${ativo ? 'bg-emerald-500' : 'bg-white/20'} cursor-pointer`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${ativo ? 'translate-x-4' : 'translate-x-0.5'}`}
              />
            </div>
            {p.ativo_label}
          </label>
        </div>

        {/* ── Preço ── */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
            {p.secao_precificacao}
          </p>

          {/* Tabela de faixas */}
          <div className="overflow-hidden rounded-md border border-white/[.12]">
            {/* Header */}
            <div className="grid grid-cols-[60px_1fr_1fr_auto] gap-0 border-b border-white/[.08] bg-white/[.04] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
              <span>{p.faixas_qtd_col}</span>
              <span>{p.faixas_preco_col}</span>
              <span>{p.faixas_total_col}</span>
              <span />
            </div>

            {/* Linha base (preço varejo, qty 1, sempre presente) */}
            <div className="grid grid-cols-[60px_1fr_1fr_auto] items-center gap-2 border-b border-white/[.05] px-2 py-2">
              <span className="font-mono text-xs text-jl-fg-3">1</span>
              <input
                type="text"
                inputMode="decimal"
                className={`${finInMono}`}
                value={precoVarejo}
                onChange={(e) => setPrecoVarejo(e.target.value)}
                disabled={saving}
                placeholder="0,00"
              />
              <span className="font-mono text-xs text-jl-fg-2">
                {precoVarejo.trim()
                  ? `R$ ${parseFloat(precoVarejo.replace(',', '.')).toFixed(2).replace('.', ',')}`
                  : '—'}
              </span>
              <span className="w-6" />
            </div>

            {/* Faixas atacado */}
            {faixas.map((f, i) => (
              <div
                key={i}
                className="grid grid-cols-[60px_1fr_1fr_auto] items-center gap-2 border-b border-white/[.05] px-2 py-2 last:border-0"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  className={`${finInMono}`}
                  value={f.qtd}
                  onChange={(e) => atualizarFaixa(i, 'qtd', e.target.value.replace(/\D/g, ''))}
                  disabled={saving}
                  placeholder="2"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  className={`${finInMono}`}
                  value={f.preco}
                  onChange={(e) => atualizarFaixa(i, 'preco', e.target.value)}
                  disabled={saving}
                  placeholder="0,00"
                />
                <span className="font-mono text-xs text-jl-fg-2">
                  {calcTotal(f.qtd, f.preco)}
                </span>
                <button
                  type="button"
                  onClick={() => removerFaixa(i)}
                  disabled={saving}
                  className="flex h-6 w-6 items-center justify-center rounded text-jl-fg-3 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 text-base leading-none"
                  title="Remover faixa"
                >
                  {p.remover_faixa}
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={adicionarFaixa}
            disabled={saving || faixas.length >= 3}
            className="mt-2 text-[11px] text-jl-fg-3 hover:text-jl-fg-1 disabled:opacity-40 transition-colors"
          >
            {p.adicionar_faixa_atacado}
          </button>
        </div>

        {/* Preço de custo */}
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.preco_custo}
          <input
            type="text"
            inputMode="decimal"
            className={`${finInMono} mt-1 max-w-[180px]`}
            value={precoCusto}
            onChange={(e) => setPrecoCusto(e.target.value)}
            disabled={saving}
            placeholder="—"
          />
        </label>

        {/* ── Estoque ── */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
            {p.secao_estoque}
          </p>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.estoque_minimo_label}
            <input
              type="text"
              inputMode="numeric"
              className={`${finInMono} mt-1 max-w-[120px]`}
              value={estoqueMinimo}
              onChange={(e) => setEstoqueMinimo(e.target.value.replace(/\D/g, ''))}
              disabled={saving}
              placeholder="0"
            />
          </label>
        </div>

        {/* Origem */}
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.origem_label}
          <select
            className={`${finSelect} mt-1 max-w-[220px]`}
            value={origem}
            onChange={(e) => setOrigem(e.target.value as OrigemCode)}
            disabled={saving}
          >
            <option value="china_manual">{p.origem_china}</option>
            <option value="brasil_nf">{p.origem_brasil_nf}</option>
          </select>
        </label>

      </div>
    </DragonModal>
  )
}
