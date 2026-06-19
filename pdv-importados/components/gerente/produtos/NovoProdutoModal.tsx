'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 mb-2 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3 first:mt-0">
      {children}
    </p>
  )
}

export function NovoProdutoModal({ open, onOpenChange, m, opcoes, onCriado }: NovoProdutoModalProps) {
  const p = m.produtos
  const nomeRef = useRef<HTMLInputElement>(null)

  // Geral
  const [nome, setNome] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [codigoInterno, setCodigoInterno] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeCode>('UN')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [ativo, setAtivo] = useState(true)

  // Preços
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [precoAtacado, setPrecoAtacado] = useState('')
  const [precoCusto, setPrecoCusto] = useState('')
  const [qtdGatilho, setQtdGatilho] = useState('')
  const [permitirAbaixoCusto, setPermitirAbaixoCusto] = useState(false)

  // Estoque
  const [estoqueMinimo, setEstoqueMinimo] = useState('')

  // Observações
  const [observacao, setObservacao] = useState('')

  const [saving, setSaving] = useState(false)

  const fechar = useCallback(() => {
    if (saving) return
    onOpenChange(false)
  }, [saving, onOpenChange])

  useEffect(() => {
    if (!open) return
    setNome('')
    setCodigoBarras('')
    setCodigoInterno('')
    setCategoriaId('')
    setMarcaId('')
    setUnidadeMedida('UN')
    setOrigem('china_manual')
    setAtivo(true)
    setPrecoVarejo('')
    setPrecoAtacado('')
    setPrecoCusto('')
    setQtdGatilho('')
    setPermitirAbaixoCusto(false)
    setEstoqueMinimo('')
    setObservacao('')
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
    const qtdGatilhoNum = qtdGatilho.trim() ? parseInt(qtdGatilho, 10) : null
    const estoqueMinimoNum = estoqueMinimo.trim() ? parseInt(estoqueMinimo, 10) : 0

    setSaving(true)
    try {
      const r = await criarProduto({
        nome: nomeTrim,
        codigo_barras: codigoBarras.trim() || null,
        codigo_interno: codigoInterno.trim() || null,
        preco_varejo: precoVarejoNum,
        preco_atacado: precoAtacadoNum,
        preco_custo: precoCustoNum,
        permitir_abaixo_custo: permitirAbaixoCusto,
        quantidade_gatilho_atacado: qtdGatilhoNum,
        origem,
        tem_nf: false,
        unidade_medida: unidadeMedida,
        categoria_id: categoriaId || null,
        marca_id: marcaId || null,
        observacao: observacao.trim() || null,
        estoque_minimo: estoqueMinimoNum,
        ativo,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: ativo ? p.criado_publicado : p.criado_rascunho })
      onCriado()
      fechar()
    } finally {
      setSaving(false)
    }
  }, [
    nome, codigoBarras, codigoInterno, categoriaId, marcaId, unidadeMedida,
    origem, ativo, precoVarejo, precoAtacado, precoCusto, qtdGatilho,
    permitirAbaixoCusto, estoqueMinimo, observacao,
    p, onCriado, fechar,
  ])

  if (!open) return null

  const fin = 'h-9 w-full rounded-md px-3 text-xs app-input !bg-white/[.08] !border-white/[.18]'
  const finMono = `${fin} font-mono`
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
      <div className="pb-1">

        {/* ── Geral ── */}
        <SectionTitle>{p.secao_geral}</SectionTitle>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.nome} *
            <input
              ref={nomeRef}
              className={`${fin} mt-1`}
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
              {p.codigo_barras}
              <input
                className={`${finMono} mt-1`}
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                disabled={saving}
                placeholder="—"
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.codigo_interno_label}
              <input
                className={`${finMono} mt-1`}
                value={codigoInterno}
                onChange={(e) => setCodigoInterno(e.target.value)}
                disabled={saving}
                placeholder="—"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.categoria}
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

          <div className="grid grid-cols-2 gap-3">
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
        </div>

        {/* ── Preços ── */}
        <SectionTitle>{p.secao_precos}</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_varejo} *
            <input
              type="text"
              inputMode="decimal"
              className={`${finMono} mt-1`}
              value={precoVarejo}
              onChange={(e) => setPrecoVarejo(e.target.value)}
              disabled={saving}
              placeholder="0,00"
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_atacado}
            <input
              type="text"
              inputMode="decimal"
              className={`${finMono} mt-1`}
              value={precoAtacado}
              onChange={(e) => setPrecoAtacado(e.target.value)}
              disabled={saving}
              placeholder="—"
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_custo}
            <input
              type="text"
              inputMode="decimal"
              className={`${finMono} mt-1`}
              value={precoCusto}
              onChange={(e) => setPrecoCusto(e.target.value)}
              disabled={saving}
              placeholder="—"
            />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 items-end gap-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.qtd_gatilho_atacado}
            <input
              type="text"
              inputMode="numeric"
              className={`${finMono} mt-1`}
              value={qtdGatilho}
              onChange={(e) => setQtdGatilho(e.target.value)}
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
        <div className="grid grid-cols-2 items-end gap-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.estoque_minimo_label}
            <input
              type="text"
              inputMode="numeric"
              className={`${finMono} mt-1`}
              value={estoqueMinimo}
              onChange={(e) => setEstoqueMinimo(e.target.value.replace(/\D/g, ''))}
              disabled={saving}
              placeholder="0"
            />
          </label>
          <label className="flex h-9 cursor-pointer items-center gap-2 text-xs font-medium text-jl-fg-3">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-500"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              disabled={saving}
            />
            {p.ativo_label}
          </label>
        </div>
        <p className="mt-1 text-[10px] text-jl-fg-3">{p.toggle_ativo_hint}</p>

        {/* ── Observações ── */}
        <SectionTitle>{p.secao_observacoes}</SectionTitle>
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
        <p className="mt-1 text-[10px] text-jl-fg-3">{p.imagem_hint}</p>

      </div>
    </DragonModal>
  )
}
