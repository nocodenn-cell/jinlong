'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { criarProduto } from '@/app/gerente/produtos/actions'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { useMoneyInput } from '@/hooks/useMoneyInput'
import { ProdutoFormTabStrip, type ProdutoFormTabId } from './produtoFormSections/ProdutoFormTabStrip'
import { DadosBasicosTab } from './produtoFormSections/DadosBasicosTab'
import { EstoqueOperacaoTab } from './produtoFormSections/EstoqueOperacaoTab'
import { CompraCustoTab } from './produtoFormSections/CompraCustoTab'

type OrigemCode = 'china_manual' | 'brasil_nf'
type UnidadeCode = 'UN' | 'KG' | 'CX' | 'FD' | 'M'

export type NovoProdutoModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  onCriado: () => void
}>

const FIN_IN = 'h-9 w-full rounded-md px-3 text-xs app-input !bg-white/[.08] !border-white/[.18]'
const FIN_IN_MONO = `${FIN_IN} font-mono`
const FIN_SELECT = 'h-9 w-full rounded-md px-3 text-xs app-select !bg-white/[.08] !border-white/[.18]'

export function NovoProdutoModal({ open, onOpenChange, m, opcoes, onCriado }: NovoProdutoModalProps) {
  const p = m.produtos
  const nomeRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<ProdutoFormTabId>('basico')
  const [nome, setNome] = useState('')
  const [codigoInterno, setCodigoInterno] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [categoriaId, setCategoriaId] = useState('')
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeCode>('UN')
  const [marcaId, setMarcaId] = useState('')
  const [referenciaFornecedor, setReferenciaFornecedor] = useState('')
  const [nomeReduzidoPdv, setNomeReduzidoPdv] = useState('')
  const [localizacaoPrateleira, setLocalizacaoPrateleira] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const precoVarejoInput = useMoneyInput()
  const precoAtacadoInput = useMoneyInput()
  const precoCustoInput = useMoneyInput()
  const [saving, setSaving] = useState(false)

  const fechar = useCallback(() => {
    if (saving) return
    onOpenChange(false)
  }, [saving, onOpenChange])

  useEffect(() => {
    if (!open) return
    setTab('basico')
    setNome('')
    setCodigoInterno('')
    setCodigoBarras('')
    setOrigem('china_manual')
    setCategoriaId('')
    setUnidadeMedida('UN')
    setMarcaId('')
    setReferenciaFornecedor('')
    setNomeReduzidoPdv('')
    setLocalizacaoPrateleira('')
    setFornecedorId('')
    precoVarejoInput.reset()
    precoAtacadoInput.reset()
    precoCustoInput.reset()
    setSaving(false)
    requestAnimationFrame(() => nomeRef.current?.focus())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const salvar = useCallback(async () => {
    const nomeTrim = nome.trim()
    if (!nomeTrim) {
      emitGerenteToast({ kind: 'error', message: p.nome_obrigatorio })
      return
    }
    const precoVarejoNum = precoVarejoInput.parse()
    if (!precoVarejoNum || precoVarejoNum <= 0) {
      emitGerenteToast({ kind: 'error', message: p.preco_invalido })
      return
    }

    setSaving(true)
    try {
      const r = await criarProduto({
        nome: nomeTrim,
        codigo_interno: codigoInterno.trim() || null,
        codigo_barras: codigoBarras.trim() || null,
        referencia_fornecedor: referenciaFornecedor.trim() || null,
        nome_reduzido_pdv: nomeReduzidoPdv.trim() || null,
        localizacao_prateleira: localizacaoPrateleira.trim() || null,
        preco_varejo: precoVarejoNum,
        preco_atacado: precoAtacadoInput.parse(),
        preco_custo: precoCustoInput.parse(),
        quantidade_gatilho_atacado: null,
        origem,
        tem_nf: false,
        unidade_medida: unidadeMedida,
        categoria_id: categoriaId || null,
        marca_id: marcaId || null,
        fornecedor_id: fornecedorId || null,
      })
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
      onCriado()
      fechar()
    } finally {
      setSaving(false)
    }
  }, [
    nome, codigoInterno, codigoBarras, referenciaFornecedor, nomeReduzidoPdv, localizacaoPrateleira,
    origem, unidadeMedida, categoriaId, marcaId, fornecedorId,
    precoVarejoInput, precoAtacadoInput, precoCustoInput,
    p, m.comum.sucesso, onCriado, fechar,
  ])

  if (!open) return null

  const tabs = [
    { id: 'basico' as const, label: p.aba_dados_basicos },
    { id: 'estoque' as const, label: p.aba_estoque_operacao },
    { id: 'compra' as const, label: p.aba_compra_custo },
    { id: 'venda' as const, label: p.aba_venda_atacado },
  ]

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
        <ProdutoFormTabStrip tabs={tabs} active={tab} onChange={setTab} disabled={saving} />

        {tab === 'basico' ? (
          <DadosBasicosTab
            p={p}
            nome={nome}
            onChangeNome={setNome}
            nomeRef={nomeRef}
            onEnterSubmit={() => void salvar()}
            codigoInterno={codigoInterno}
            onChangeCodigoInterno={setCodigoInterno}
            codigoBarras={codigoBarras}
            onChangeCodigoBarras={setCodigoBarras}
            origem={origem}
            onChangeOrigem={setOrigem}
            categoriaId={categoriaId}
            onChangeCategoriaId={setCategoriaId}
            categorias={opcoes.categorias}
            unidadeMedida={unidadeMedida}
            onChangeUnidadeMedida={setUnidadeMedida}
            marcaId={marcaId}
            onChangeMarcaId={setMarcaId}
            marcas={opcoes.marcas}
            referenciaFornecedor={referenciaFornecedor}
            onChangeReferenciaFornecedor={setReferenciaFornecedor}
            nomeReduzidoPdv={nomeReduzidoPdv}
            onChangeNomeReduzidoPdv={setNomeReduzidoPdv}
            disabled={saving}
            inputClassName={FIN_IN}
            inputMonoClassName={FIN_IN_MONO}
            selectClassName={FIN_SELECT}
          />
        ) : null}

        {tab === 'estoque' ? (
          <EstoqueOperacaoTab
            p={p}
            localizacaoPrateleira={localizacaoPrateleira}
            onChangeLocalizacaoPrateleira={setLocalizacaoPrateleira}
            disabled={saving}
            estoqueAtual={null}
            estoqueMinimo={null}
            inputClassName={FIN_IN}
          />
        ) : null}

        {tab === 'compra' ? (
          <CompraCustoTab
            p={p}
            fornecedorId={fornecedorId}
            onChangeFornecedorId={setFornecedorId}
            fornecedores={opcoes.fornecedores}
            custoCompraInput={precoCustoInput}
            custoMedio={null}
            disabled={saving}
            inputClassName={FIN_IN}
            selectClassName={FIN_SELECT}
          />
        ) : null}

        {tab === 'venda' ? (
          <div className="space-y-4">
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.preco_varejo} *
              <input
                type="text"
                inputMode="decimal"
                className={`${FIN_IN_MONO} mt-1`}
                value={precoVarejoInput.display}
                onChange={precoVarejoInput.onChange}
                disabled={saving}
                placeholder="0,00"
              />
            </label>
            <p className="text-[11px] text-jl-fg-3">{p.faixas_disponivel_apos_salvar}</p>
          </div>
        ) : null}
      </div>
    </DragonModal>
  )
}
