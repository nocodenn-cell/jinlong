'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'
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

export function ProdutosEditarCatalogoModal({
  open,
  onOpenChange,
  produto,
  m,
  opcoes,
  onSalvo,
}: ProdutosEditarCatalogoModalProps) {
  const p = m.produtos

  // Bloco 1 — essenciais
  const [nome, setNome] = useState('')
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeCode>('UN')

  // Bloco 2 — mais opções
  const [maisOpcoesAberto, setMaisOpcoesAberto] = useState(false)
  const [codigoBarras, setCodigoBarras] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [precoAtacado, setPrecoAtacado] = useState('')
  const [precoCusto, setPrecoCusto] = useState('')
  const [permitirAbaixoCusto, setPermitirAbaixoCusto] = useState(false)
  const [observacao, setObservacao] = useState('')

  // Bloco 3 — dados fiscais
  const [dadosFiscaisAberto, setDadosFiscaisAberto] = useState(false)
  const [ncm, setNcm] = useState('')
  const [cfopProduto, setCfopProduto] = useState('')
  const [csosn, setCsosn] = useState('400')
  const [cest, setCest] = useState('')
  const [cstPis, setCstPis] = useState('07')
  const [cstCofins, setCstCofins] = useState('07')

  // Campo legado preservado no payload sem exposição na UI
  const [qtdGatilhoLegado, setQtdGatilhoLegado] = useState<number | null>(null)

  const [saving, setSaving] = useState(false)

  const fechar = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open || !produto) return
    setNome(produto.nome)
    setPrecoVarejo(String(produto.preco_varejo))
    setUnidadeMedida((produto.unidade_medida as UnidadeCode) || 'UN')
    setMaisOpcoesAberto(false)
    setCodigoBarras(produto.codigo_barras ?? '')
    // Map legacy brasil_sem_nf to brasil_nf so the dropdown selects "Brasil"
    setOrigem(produto.origem === 'brasil_sem_nf' ? 'brasil_nf' : produto.origem as OrigemCode)
    setCategoriaId(produto.categoria_id ?? '')
    setMarcaId(produto.marca_id ?? '')
    setFornecedorId(produto.fornecedor_id ?? '')
    setPrecoAtacado(produto.preco_atacado != null ? String(produto.preco_atacado) : '')
    setPrecoCusto(produto.preco_custo != null ? String(produto.preco_custo) : '')
    setPermitirAbaixoCusto(produto.permitir_abaixo_custo)
    setObservacao(produto.observacao ?? '')
    setDadosFiscaisAberto(false)
    setNcm(produto.ncm ?? '')
    setCfopProduto(produto.cfop_produto ?? '')
    setCsosn(produto.csosn ?? '400')
    setCest(produto.cest ?? '')
    setCstPis(produto.cst_pis ?? '07')
    setCstCofins(produto.cst_cofins ?? '07')
    // Preserve existing value without exposing in UI (dead code field)
    setQtdGatilhoLegado(produto.quantidade_gatilho_atacado ?? null)
  }, [open, produto])

  const salvar = useCallback(async () => {
    if (!produto) return
    setSaving(true)
    try {
      const precoVarejoNum = parseFloat(precoVarejo.replace(',', '.'))
      const precoAtacadoNum = precoAtacado.trim()
        ? parseFloat(precoAtacado.replace(',', '.'))
        : null
      const precoCustoNum = precoCusto.trim() ? parseFloat(precoCusto.replace(',', '.')) : null

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
        quantidade_gatilho_atacado: qtdGatilhoLegado,
        unidade_medida: unidadeMedida,
        observacao: observacao.trim() || null,
        categoria_id: categoriaId || null,
        marca_id: marcaId || null,
        fornecedor_id: fornecedorId || null,
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
    precoVarejo, precoAtacado, precoCusto, permitirAbaixoCusto, qtdGatilhoLegado,
    unidadeMedida, observacao,
    categoriaId, marcaId, fornecedorId,
    ncm, cfopProduto, csosn, cest, cstPis, cstCofins,
    m.comum.sucesso, onSalvo, fechar,
  ])

  if (!open || !produto) return null

  const finIn = 'h-9 w-full rounded-md px-3 text-xs app-input !bg-white/[.08] !border-white/[.18]'
  const finInMono = `${finIn} font-mono`
  const finSelect = 'h-9 w-full rounded-md px-3 text-xs app-select !bg-white/[.08] !border-white/[.18]'
  const isBrasilNf = origem === 'brasil_nf' || origem === 'brasil_sem_nf'

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

        {/* BLOCO 1 — Dados Essenciais */}
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
          <div className="grid grid-cols-2 gap-3">
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

        {/* BLOCO 2 — Mais opções */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setMaisOpcoesAberto((v) => !v)}
            disabled={saving}
            className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3 hover:text-jl-fg-2 transition-colors"
          >
            <span>{p.secao_mais_opcoes}</span>
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${maisOpcoesAberto ? 'rotate-180' : ''}`}
            />
          </button>

          {maisOpcoesAberto && (
            <div className="mt-3 space-y-3">
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
                  {opcoes.categorias.length === 0 && (
                    <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.categoria_hint_criar}</span>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  <span className="mt-0.5 block text-[10px] text-jl-fg-3 leading-tight">{p.tooltip_preco_atacado}</span>
                </label>
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
              </div>

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
            </div>
          )}
        </div>

        {/* BLOCO 3 — Dados Fiscais */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setDadosFiscaisAberto((v) => !v)}
            disabled={saving}
            className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3 hover:text-jl-fg-2 transition-colors"
          >
            <span className="flex items-center gap-2">
              {p.secao_fiscal}
              {isBrasilNf && (
                <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">!</span>
              )}
            </span>
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${dadosFiscaisAberto ? 'rotate-180' : ''}`}
            />
          </button>

          {dadosFiscaisAberto && (
            <div className="mt-3 space-y-3">
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
          )}
        </div>

      </div>
    </DragonModal>
  )
}
