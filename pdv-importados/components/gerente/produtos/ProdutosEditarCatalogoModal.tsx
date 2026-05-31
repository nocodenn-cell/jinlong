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

type OrigemCode = 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'  // brasil_sem_nf is legacy DB value
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

  // --- precificação ---
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [precoAtacado, setPrecoAtacado] = useState('')
  const [precoCusto, setPrecoCusto] = useState('')
  const [permitirAbaixoCusto, setPermitirAbaixoCusto] = useState(false)
  const [qtdGatilho, setQtdGatilho] = useState('')

  // --- medida + complementar ---
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeCode>('UN')
  const [observacao, setObservacao] = useState('')

  // --- classificação ---
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')

  // --- dados fiscais ---
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
    // Map legacy brasil_sem_nf to brasil_nf so the dropdown selects "Brasil"
    setOrigem(produto.origem === 'brasil_sem_nf' ? 'brasil_nf' : produto.origem as OrigemCode)
    setPrecoVarejo(String(produto.preco_varejo))
    setPrecoAtacado(produto.preco_atacado != null ? String(produto.preco_atacado) : '')
    setPrecoCusto(produto.preco_custo != null ? String(produto.preco_custo) : '')
    setPermitirAbaixoCusto(produto.permitir_abaixo_custo)
    setQtdGatilho(produto.quantidade_gatilho_atacado != null ? String(produto.quantidade_gatilho_atacado) : '')
    setUnidadeMedida((produto.unidade_medida as UnidadeCode) || 'UN')
    setObservacao(produto.observacao ?? '')
    setCategoriaId(produto.categoria_id ?? '')
    setMarcaId(produto.marca_id ?? '')
    setFornecedorId(produto.fornecedor_id ?? '')
    // campos fiscais
    setNcm(produto.ncm ?? '')
    setCfopProduto(produto.cfop_produto ?? '')
    setCsosn(produto.csosn ?? '400')
    setCest(produto.cest ?? '')
    setCstPis(produto.cst_pis ?? '07')
    setCstCofins(produto.cst_cofins ?? '07')
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
      const precoCustoNum = precoCusto.trim() ? parseFloat(precoCusto.replace(',', '.')) : null
      const qtdGatilhoNum = qtdGatilho.trim() ? parseInt(qtdGatilho, 10) : null

      const r = await atualizarDadosProdutoGerente({
        produto_id: produto.id,
        nome: nome.trim(),
        codigo_barras: codigoBarras.trim(),
        origem,
        tem_nf: produto.tem_nf,
        preco_varejo: precoVarejoNum,
        preco_atacado: precoAtacadoNum,
        preco_custo: precoCustoNum,
        permitir_abaixo_custo: permitirAbaixoCusto,
        quantidade_gatilho_atacado: qtdGatilhoNum,
        unidade_medida: unidadeMedida,
        observacao: observacao.trim() || null,
        categoria_id: categoriaId || null,
        marca_id: marcaId || null,
        fornecedor_id: fornecedorId || null,
        // campos fiscais
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
    produto, nome, codigoBarras, origem,
    precoVarejo, precoAtacado, precoCusto, permitirAbaixoCusto, qtdGatilho,
    unidadeMedida, observacao,
    categoriaId, marcaId, fornecedorId,
    ncm, cfopProduto, csosn, cest, cstPis, cstCofins,
    m.comum.sucesso, onSalvo, fechar,
  ])

  if (!open || !produto) return null

  const finIn = 'h-9 w-full rounded-md px-3 text-xs app-input !bg-white/[.08] !border-white/[.18]'
  const finInMono = `${finIn} font-mono`
  const finSelect = 'h-9 w-full rounded-md px-3 text-xs app-select !bg-white/[.08] !border-white/[.18]'

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
        className="dragon-elev-2 flex max-h-[90vh] w-full max-w-lg flex-col rounded-none sm:rounded-lg"
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
              className="mt-1 w-full resize-none rounded-md px-3 py-2 text-xs app-input !bg-white/[.08] !border-white/[.18]"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={saving}
              placeholder="—"
            />
          </label>

          {/* ── Dados Fiscais (NF-e / NFC-e) ── */}
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
