'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { criarProduto } from '@/app/gerente/produtos/actions'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'

type OrigemCode = 'china_manual' | 'brasil_nf'
type UnidadeCode = 'UN' | 'KG' | 'CX' | 'FD' | 'M'

export type NovoProdutoModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  onCriado: () => void
}>

export function NovoProdutoModal({ open, onOpenChange, m, opcoes, onCriado }: NovoProdutoModalProps) {
  const p = m.produtos
  const nomeRef = useRef<HTMLInputElement>(null)

  // Bloco 1 — essenciais
  const [nome, setNome] = useState('')
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeCode>('UN')

  // Bloco 2 — mais opções
  const [maisOpcoesAberto, setMaisOpcoesAberto] = useState(false)
  const [codigoBarras, setCodigoBarras] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [categoriaId, setCategoriaId] = useState('')
  const [precoAtacado, setPrecoAtacado] = useState('')
  const [precoCusto, setPrecoCusto] = useState('')
  const [permitirAbaixoCusto, setPermitirAbaixoCusto] = useState(false)
  const [marcaId, setMarcaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [observacao, setObservacao] = useState('')

  // Bloco 3 — dados fiscais
  const [dadosFiscaisAberto, setDadosFiscaisAberto] = useState(false)
  const [ncm, setNcm] = useState('')

  const [saving, setSaving] = useState(false)

  const fechar = useCallback(() => {
    if (saving) return
    onOpenChange(false)
  }, [saving, onOpenChange])

  useEffect(() => {
    if (!open) return
    setNome('')
    setPrecoVarejo('')
    setUnidadeMedida('UN')
    setMaisOpcoesAberto(false)
    setCodigoBarras('')
    setOrigem('china_manual')
    setCategoriaId('')
    setPrecoAtacado('')
    setPrecoCusto('')
    setPermitirAbaixoCusto(false)
    setMarcaId('')
    setFornecedorId('')
    setObservacao('')
    setDadosFiscaisAberto(false)
    setNcm('')
    setSaving(false)
    requestAnimationFrame(() => nomeRef.current?.focus())
  }, [open])

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
    const precoAtacadoNum = precoAtacado.trim() ? parseFloat(precoAtacado.replace(',', '.')) : null
    const precoCustoNum = precoCusto.trim() ? parseFloat(precoCusto.replace(',', '.')) : null

    setSaving(true)
    try {
      const r = await criarProduto({
        nome: nomeTrim,
        codigo_barras: codigoBarras.trim() || null,
        preco_varejo: precoVarejoNum,
        preco_atacado: precoAtacadoNum,
        preco_custo: precoCustoNum,
        permitir_abaixo_custo: permitirAbaixoCusto,
        origem,
        tem_nf: false,
        unidade_medida: unidadeMedida,
        categoria_id: categoriaId || null,
        marca_id: marcaId || null,
        fornecedor_id: fornecedorId || null,
        observacao: observacao.trim() || null,
        ncm: ncm.trim() || undefined,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: p.criado_publicado })
      onCriado()
      fechar()
    } finally {
      setSaving(false)
    }
  }, [
    nome, codigoBarras, origem, precoVarejo, precoAtacado, precoCusto, permitirAbaixoCusto,
    unidadeMedida, categoriaId, marcaId, fornecedorId, observacao, ncm,
    p, onCriado, fechar,
  ])

  if (!open) return null

  const finIn = 'h-9 w-full rounded-md px-3 text-xs app-input !bg-white/[.08] !border-white/[.18]'
  const finInMono = `${finIn} font-mono`
  const finSelect = 'h-9 w-full rounded-md px-3 text-xs app-select !bg-white/[.08] !border-white/[.18]'
  const isBrasilNf = origem === 'brasil_nf'

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
      <div className="pb-1">

        {/* BLOCO 1 — Dados Essenciais */}
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.preco_varejo} *
              <input
                type="text"
                inputMode="decimal"
                className={`${finInMono} mt-1`}
                value={precoVarejo}
                onChange={(e) => setPrecoVarejo(e.target.value)}
                disabled={saving}
                placeholder="0,00"
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
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-jl-fg-3">
                  {p.codigo_barras}
                  <input
                    className={`${finInMono} mt-1`}
                    value={codigoBarras}
                    onChange={(e) => setCodigoBarras(e.target.value)}
                    disabled={saving}
                    placeholder={p.codigo_barras_opcional}
                    autoComplete="off"
                  />
                </label>
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
              </div>

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
                  rows={2}
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
            <div className="mt-3">
              <label className="block text-xs font-medium text-jl-fg-3">
                {p.field_ncm}
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className={`${finInMono} flex-1`}
                    value={ncm}
                    maxLength={8}
                    inputMode="numeric"
                    placeholder="00000000"
                    onChange={(e) => setNcm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    disabled={saving}
                  />
                  {ncm.length > 0 && ncm.length < 8 && (
                    <span className="shrink-0 text-[10px] text-amber-400">{8 - ncm.length} dígito(s)</span>
                  )}
                  {ncm.length === 8 && (
                    <span className="shrink-0 text-[10px] text-emerald-400">✓</span>
                  )}
                </div>
                <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.hint_ncm}</span>
              </label>
            </div>
          )}
        </div>

      </div>
    </DragonModal>
  )
}
