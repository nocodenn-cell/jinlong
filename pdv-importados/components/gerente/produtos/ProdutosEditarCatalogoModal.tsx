'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, RefreshCw } from 'lucide-react'
import { atualizarDadosProdutoGerente } from '@/app/gerente/produtos/actions'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
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

type FaixaPreco = { qtd: string; preco: string }

function gerarSkuAleatorio() {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

function calcTotal(qtd: string, preco: string): string {
  const q = parseInt(qtd, 10)
  const pv = parseFloat(preco.replace(',', '.'))
  if (!Number.isFinite(q) || !Number.isFinite(pv) || q <= 0 || pv <= 0) return '—'
  return `R$ ${(q * pv).toFixed(2).replace('.', ',')}`
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

  // ── dados do produto ──
  const [nome, setNome] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [sku, setSku] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [descricaoCurta, setDescricaoCurta] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeCode>('UN')

  // ── preço ──
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [faixas, setFaixas] = useState<FaixaPreco[]>([])
  const [precoCusto, setPrecoCusto] = useState('')
  const [permitirAbaixoCusto, setPermitirAbaixoCusto] = useState(false)

  // ── estoque ──
  const [estoqueMinimo, setEstoqueMinimo] = useState('')

  // ── dados fiscais ──
  const [ncm, setNcm] = useState('')
  const [cfopProduto, setCfopProduto] = useState('')
  const [csosn, setCsosn] = useState('400')
  const [cest, setCest] = useState('')
  const [cstPis, setCstPis] = useState('07')
  const [cstCofins, setCstCofins] = useState('07')

  const [saving, setSaving] = useState(false)

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open || !produto) return
    setNome(produto.nome)
    setCodigoBarras(produto.codigo_barras ?? '')
    setSku(produto.codigo_interno ?? '')
    setOrigem(produto.origem === 'brasil_sem_nf' ? 'brasil_nf' : produto.origem as OrigemCode)
    setCategoriaId(produto.categoria_id ?? '')
    setMarcaId(produto.marca_id ?? '')
    setFornecedorId(produto.fornecedor_id ?? '')
    setDescricaoCurta(produto.observacao ?? '')
    setAtivo(produto.ativo)
    setUnidadeMedida((produto.unidade_medida as UnidadeCode) || 'UN')
    setPrecoVarejo(String(produto.preco_varejo))
    // Reconstruct faixas from atacado price
    if (produto.preco_atacado != null && produto.quantidade_gatilho_atacado != null) {
      setFaixas([{
        qtd: String(produto.quantidade_gatilho_atacado),
        preco: String(produto.preco_atacado),
      }])
    } else {
      setFaixas([])
    }
    setPrecoCusto(produto.preco_custo != null ? String(produto.preco_custo) : '')
    setPermitirAbaixoCusto(produto.permitir_abaixo_custo)
    setEstoqueMinimo(String(produto.estoque_minimo ?? 0))
    setNcm(produto.ncm ?? '')
    setCfopProduto(produto.cfop_produto ?? '')
    setCsosn(produto.csosn ?? '400')
    setCest(produto.cest ?? '')
    setCstPis(produto.cst_pis ?? '07')
    setCstCofins(produto.cst_cofins ?? '07')
  }, [open, produto])

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
    if (!produto) return
    setSaving(true)
    try {
      const precoVarejoNum = parseFloat(precoVarejo.replace(',', '.'))
      const precoCustoNum = precoCusto.trim() ? parseFloat(precoCusto.replace(',', '.')) : null

      const ultimaFaixa = faixas[faixas.length - 1]
      const precoAtacadoNum = ultimaFaixa?.preco.trim()
        ? parseFloat(ultimaFaixa.preco.replace(',', '.'))
        : null
      const qtdGatilhoNum = ultimaFaixa?.qtd.trim() ? parseInt(ultimaFaixa.qtd, 10) : null

      const estoqueMin = estoqueMinimo.trim() ? parseInt(estoqueMinimo, 10) : 0

      const r = await atualizarDadosProdutoGerente({
        produto_id: produto.id,
        nome: nome.trim(),
        codigo_barras: codigoBarras.trim(),
        codigo_interno: sku.trim() || null,
        origem,
        tem_nf: produto.tem_nf,
        preco_varejo: precoVarejoNum,
        preco_atacado: precoAtacadoNum,
        preco_custo: precoCustoNum,
        permitir_abaixo_custo: permitirAbaixoCusto,
        quantidade_gatilho_atacado: qtdGatilhoNum,
        unidade_medida: unidadeMedida,
        observacao: descricaoCurta.trim() || null,
        categoria_id: categoriaId || null,
        marca_id: marcaId || null,
        fornecedor_id: fornecedorId || null,
        ativo,
        estoque_minimo: estoqueMin,
        ncm: ncm.trim() || null,
        cfop_produto: cfopProduto.trim() || null,
        csosn: csosn.trim() || null,
        cest: cest.trim() || null,
        cst_pis: cstPis.trim() || null,
        cst_cofins: cstCofins.trim() || null,
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
    produto, nome, codigoBarras, sku, origem,
    precoVarejo, faixas, precoCusto, permitirAbaixoCusto,
    unidadeMedida, descricaoCurta, categoriaId, marcaId, fornecedorId,
    estoqueMinimo,
    ncm, cfopProduto, csosn, cest, cstPis, cstCofins,
    m.comum.sucesso, onSalvo, fechar,
  ])

  if (!open || !produto) return null

  const finIn = 'h-9 w-full rounded-md px-3 text-xs app-input !bg-white/[.08] !border-white/[.18]'
  const finInMono = `${finIn} font-mono`
  const finSelect = 'h-9 w-full rounded-md px-3 text-xs app-select !bg-white/[.08] !border-white/[.18]'

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="lg"
      icon={Pencil}
      title={p.editar_modal_titulo}
      dismissable={!saving}
      closeLabel={m.comum.cancelar}
      footer={
        <>
          <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={saving}>
            {m.comum.cancelar}
          </Button>
          <Button type="button" className="app-btn-accent" disabled={saving} onClick={() => void salvar()}>
            {saving ? '…' : p.editar_modal_salvar}
          </Button>
        </>
      }
    >
      <div className="pb-1">

        {/* ── Dados do Produto ── */}
        <SectionTitle>{p.secao_dados_produto}</SectionTitle>
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
        </div>

        {/* ── Preço ── */}
        <SectionTitle>{p.secao_precificacao}</SectionTitle>

        <div className="overflow-hidden rounded-md border border-white/[.12]">
          <div className="grid grid-cols-[60px_1fr_1fr_auto] gap-0 border-b border-white/[.08] bg-white/[.04] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
            <span>{p.faixas_qtd_col}</span>
            <span>{p.faixas_preco_col}</span>
            <span>{p.faixas_total_col}</span>
            <span />
          </div>

          {/* Linha base */}
          <div className="grid grid-cols-[60px_1fr_1fr_auto] items-center gap-2 border-b border-white/[.05] px-2 py-2">
            <span className="font-mono text-xs text-jl-fg-3">1</span>
            <input
              type="text"
              inputMode="decimal"
              className={finInMono}
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

          {faixas.map((f, i) => (
            <div
              key={i}
              className="grid grid-cols-[60px_1fr_1fr_auto] items-center gap-2 border-b border-white/[.05] px-2 py-2 last:border-0"
            >
              <input
                type="text"
                inputMode="numeric"
                className={finInMono}
                value={f.qtd}
                onChange={(e) => atualizarFaixa(i, 'qtd', e.target.value.replace(/\D/g, ''))}
                disabled={saving}
                placeholder="2"
              />
              <input
                type="text"
                inputMode="decimal"
                className={finInMono}
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

        <div className="mt-3 grid grid-cols-2 items-end gap-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_custo}
            <input
              type="text"
              inputMode="decimal"
              className={`${finInMono} mt-1`}
              value={precoCusto}
              onChange={(e) => setPrecoCusto(e.target.value)}
              disabled={saving}
              placeholder="—"
            />
          </label>
          <label className="flex h-9 cursor-pointer items-center gap-2 text-xs font-medium text-jl-fg-3">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-400"
              checked={permitirAbaixoCusto}
              onChange={(e) => setPermitirAbaixoCusto(e.target.checked)}
              disabled={saving}
            />
            {p.permitir_abaixo_custo}
          </label>
        </div>

        {/* ── Estoque ── */}
        <SectionTitle>{p.secao_estoque}</SectionTitle>
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

        {/* ── Classificação ── */}
        <SectionTitle>{p.secao_classificacao}</SectionTitle>
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

        {/* ── Dados Fiscais ── */}
        <SectionTitle>{p.secao_fiscal}</SectionTitle>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_ncm}
              <input
                className={`${finInMono} mt-1`}
                value={ncm}
                maxLength={8}
                inputMode="numeric"
                placeholder="00000000"
                onChange={(e) => setNcm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                disabled={saving}
              />
              <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.hint_ncm}</span>
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_cfop_produto}
              <input
                className={`${finInMono} mt-1`}
                value={cfopProduto}
                maxLength={4}
                inputMode="numeric"
                placeholder="5102"
                onChange={(e) => setCfopProduto(e.target.value.replace(/\D/g, '').slice(0, 4))}
                disabled={saving}
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_csosn}
              <select
                className={`${finSelect} mt-1 font-mono`}
                value={csosn}
                onChange={(e) => setCsosn(e.target.value)}
                disabled={saving}
              >
                <option value="102">102 – Tributada s/ crédito</option>
                <option value="400">400 – Não tributada (SN)</option>
                <option value="500">500 – ICMS-ST cobrado ant.</option>
                <option value="900">900 – Outros</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_cst_pis}
              <select
                className={`${finSelect} mt-1 font-mono`}
                value={cstPis}
                onChange={(e) => setCstPis(e.target.value)}
                disabled={saving}
              >
                <option value="07">07 – Isenta</option>
                <option value="49">49 – Outras saídas</option>
                <option value="01">01 – Alíq. básica</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.field_cst_cofins}
              <select
                className={`${finSelect} mt-1 font-mono`}
                value={cstCofins}
                onChange={(e) => setCstCofins(e.target.value)}
                disabled={saving}
              >
                <option value="07">07 – Isenta</option>
                <option value="49">49 – Outras saídas</option>
                <option value="01">01 – Alíq. básica</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.field_cest}
            <input
              className={`${finInMono} mt-1`}
              value={cest}
              maxLength={7}
              inputMode="numeric"
              placeholder={p.hint_cest}
              onChange={(e) => setCest(e.target.value.replace(/\D/g, '').slice(0, 7))}
              disabled={saving}
            />
          </label>
        </div>

      </div>
    </DragonModal>
  )
}
