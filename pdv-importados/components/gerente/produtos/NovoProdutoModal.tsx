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

  const [nome, setNome] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [precoAtacado, setPrecoAtacado] = useState('')
  const [precoCusto, setPrecoCusto] = useState('')
  const [permitirAbaixoCusto, setPermitirAbaixoCusto] = useState(false)
  const [qtdGatilho, setQtdGatilho] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [ncm, setNcm] = useState('')
  const [saving, setSaving] = useState(false)

  function handlePreco(set: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const d = e.target.value.replace(/\D/g, '').replace(/^0+/, '') || '0'
      const p = d.padStart(3, '0')
      set(p.slice(0, -2) + ',' + p.slice(-2))
    }
  }

  const fechar = useCallback(() => {
    if (saving) return
    onOpenChange(false)
  }, [saving, onOpenChange])

  useEffect(() => {
    if (!open) return
    setNome('')
    setCodigoBarras('')
    setOrigem('china_manual')
    setPrecoVarejo('')
    setPrecoAtacado('')
    setPrecoCusto('')
    setPermitirAbaixoCusto(false)
    setQtdGatilho('')
    setCategoriaId('')
    setNcm('')
    setSaving(false)
    // Auto-focus no nome ao abrir
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

    setSaving(true)
    try {
      const r = await criarProduto({
        nome: nomeTrim,
        codigo_barras: codigoBarras.trim() || null,
        preco_varejo: precoVarejoNum,
        preco_atacado: precoAtacadoNum,
        preco_custo: precoCustoNum,
        permitir_abaixo_custo: permitirAbaixoCusto,
        quantidade_gatilho_atacado: qtdGatilhoNum,
        origem,
        tem_nf: false,
        categoria_id: categoriaId || null,
        ncm: ncm.trim() || undefined,
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
  }, [nome, codigoBarras, origem, precoVarejo, precoAtacado, precoCusto, permitirAbaixoCusto, qtdGatilho, categoriaId, ncm, p, onCriado, fechar])

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
        <div className="pb-1">

          {/* Identificação */}
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
            {p.secao_identificacao}
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
          </div>

          {/* Precificação — linha única compacta */}
          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
            {p.secao_precificacao}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.preco_varejo} *
              <input
                type="text"
                inputMode="decimal"
                className={`${finInMono} mt-1`}
                value={precoVarejo}
                onChange={handlePreco(setPrecoVarejo)}
                disabled={saving}
                placeholder="0,00"
              />
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.preco_atacado}
              <input
                type="text"
                inputMode="decimal"
                className={`${finInMono} mt-1`}
                value={precoAtacado}
                onChange={handlePreco(setPrecoAtacado)}
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
                onChange={handlePreco(setPrecoCusto)}
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

          {/* NCM (fiscal) */}
          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
            {p.secao_fiscal}
          </p>
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

          {/* Categoria (opcional) */}
          {opcoes.categorias.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
                {p.categoria}
              </p>
              <label className="block text-xs font-medium text-jl-fg-3">
                <select
                  className={`${finSelect} mt-1`}
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">{p.filtro_categoria_todas}</option>
                  {opcoes.categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
    </DragonModal>
  )
}
