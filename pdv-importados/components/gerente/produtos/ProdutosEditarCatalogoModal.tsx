'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { atualizarDadosProdutoGerente } from '@/app/gerente/produtos/actions'
import type { OpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { useMoneyInput } from '@/hooks/useMoneyInput'
import { ProdutoFormTabStrip, type ProdutoFormTabId } from './produtoFormSections/ProdutoFormTabStrip'
import { DadosBasicosTab } from './produtoFormSections/DadosBasicosTab'
import { EstoqueOperacaoTab } from './produtoFormSections/EstoqueOperacaoTab'
import { CompraCustoTab } from './produtoFormSections/CompraCustoTab'
import { FaixasAtacadoEditor } from './produtoFormSections/FaixasAtacadoEditor'

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

const FIN_IN = 'h-9 w-full rounded-md px-3 text-xs app-input !bg-white/[.08] !border-white/[.18]'
const FIN_IN_MONO = `${FIN_IN} font-mono`
const FIN_SELECT = 'h-9 w-full rounded-md px-3 text-xs app-select !bg-white/[.08] !border-white/[.18]'

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

  const [tab, setTab] = useState<ProdutoFormTabId>('basico')

  // --- identificação / dados básicos ---
  const [nome, setNome] = useState('')
  const [codigoInterno, setCodigoInterno] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeCode>('UN')
  const [referenciaFornecedor, setReferenciaFornecedor] = useState('')
  const [nomeReduzidoPdv, setNomeReduzidoPdv] = useState('')

  // --- estoque e operação ---
  const [localizacaoPrateleira, setLocalizacaoPrateleira] = useState('')

  // --- classificação ---
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')

  // --- precificação ---
  const precoVarejoInput = useMoneyInput()
  const precoAtacadoInput = useMoneyInput()
  const precoCustoInput = useMoneyInput()
  const [permitirAbaixoCusto, setPermitirAbaixoCusto] = useState(false)

  // --- complementar ---
  const [observacao, setObservacao] = useState('')

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
    setTab('basico')
    setNome(produto.nome)
    setCodigoInterno(produto.codigo_interno ?? '')
    setCodigoBarras(produto.codigo_barras ?? '')
    // Map legacy brasil_sem_nf to brasil_nf so the dropdown selects "Brasil"
    setOrigem(produto.origem === 'brasil_sem_nf' ? 'brasil_nf' : produto.origem as OrigemCode)
    setUnidadeMedida((produto.unidade_medida as UnidadeCode) || 'UN')
    setReferenciaFornecedor(produto.referencia_fornecedor ?? '')
    setNomeReduzidoPdv(produto.nome_reduzido_pdv ?? '')
    setLocalizacaoPrateleira(produto.localizacao_prateleira ?? '')
    setCategoriaId(produto.categoria_id ?? '')
    setMarcaId(produto.marca_id ?? '')
    setFornecedorId(produto.fornecedor_id ?? '')
    precoVarejoInput.reset(produto.preco_varejo)
    precoAtacadoInput.reset(produto.preco_atacado ?? undefined)
    precoCustoInput.reset(produto.preco_custo ?? undefined)
    setPermitirAbaixoCusto(produto.permitir_abaixo_custo)
    setObservacao(produto.observacao ?? '')
    setNcm(produto.ncm ?? '')
    setCfopProduto(produto.cfop_produto ?? '')
    setCsosn(produto.csosn ?? '400')
    setCest(produto.cest ?? '')
    setCstPis(produto.cst_pis ?? '07')
    setCstCofins(produto.cst_cofins ?? '07')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, produto])

  const salvar = useCallback(async () => {
    if (!produto) return
    setSaving(true)
    try {
      const precoVarejoNum = precoVarejoInput.parse()
      if (precoVarejoNum === null || !Number.isFinite(precoVarejoNum)) {
        emitGerenteToast({ kind: 'error', message: p.preco_invalido })
        return
      }

      const r = await atualizarDadosProdutoGerente({
        produto_id: produto.id,
        nome: nome.trim(),
        codigo_interno: codigoInterno.trim() || null,
        codigo_barras: codigoBarras.trim(),
        referencia_fornecedor: referenciaFornecedor.trim() || null,
        nome_reduzido_pdv: nomeReduzidoPdv.trim() || null,
        localizacao_prateleira: localizacaoPrateleira.trim() || null,
        origem,
        tem_nf: produto.tem_nf,
        preco_varejo: precoVarejoNum,
        preco_atacado: precoAtacadoInput.parse(),
        preco_custo: precoCustoInput.parse(),
        permitir_abaixo_custo: permitirAbaixoCusto,
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
    produto, nome, codigoInterno, codigoBarras, referenciaFornecedor, nomeReduzidoPdv, localizacaoPrateleira, origem,
    precoVarejoInput, precoAtacadoInput, precoCustoInput, permitirAbaixoCusto,
    unidadeMedida, observacao,
    categoriaId, marcaId, fornecedorId,
    ncm, cfopProduto, csosn, cest, cstPis, cstCofins,
    p, m.comum.sucesso, onSalvo, fechar,
  ])

  if (!open || !produto) return null

  const tabs = [
    { id: 'basico' as const, label: p.aba_dados_basicos },
    { id: 'estoque' as const, label: p.aba_estoque_operacao },
    { id: 'compra' as const, label: p.aba_compra_custo },
    { id: 'venda' as const, label: p.aba_venda_atacado },
    { id: 'fiscal' as const, label: p.secao_fiscal },
  ]

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
        <ProdutoFormTabStrip tabs={tabs} active={tab} onChange={setTab} disabled={saving} />

        {tab === 'basico' ? (
          <>
            <DadosBasicosTab
              p={p}
              nome={nome}
              onChangeNome={setNome}
              codigoInterno={codigoInterno}
              onChangeCodigoInterno={setCodigoInterno}
              codigoBarras={codigoBarras}
              onChangeCodigoBarras={setCodigoBarras}
              origem={origem === 'brasil_sem_nf' ? 'brasil_nf' : origem}
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
          </>
        ) : null}

        {tab === 'estoque' ? (
          <EstoqueOperacaoTab
            p={p}
            localizacaoPrateleira={localizacaoPrateleira}
            onChangeLocalizacaoPrateleira={setLocalizacaoPrateleira}
            disabled={saving}
            estoqueAtual={produto.quantidade_atual}
            estoqueMinimo={produto.estoque_minimo}
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
            custoMedio={produto.preco_custo_medio}
            disabled={saving}
            inputClassName={FIN_IN}
            selectClassName={FIN_SELECT}
          />
        ) : null}

        {tab === 'venda' ? (
          <div>
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
            {(() => {
              const v = precoVarejoInput.parse()
              const c = precoCustoInput.parse()
              if (!v || v <= 0 || c === null) return null
              const pct = ((v - c) / v) * 100
              const cor = pct < 0 ? 'text-red-400' : pct < 20 ? 'text-amber-400' : 'text-emerald-400'
              return <p className={`mt-1.5 text-[11px] font-mono ${cor}`}>Margem: {pct.toFixed(1)}%</p>
            })()}

            <div className="mt-5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
                {p.titulo_faixas_atacado}
              </p>
              <p className="mb-3 text-[11px] text-jl-fg-3">{p.hint_faixas_atacado}</p>
              <FaixasAtacadoEditor produtoId={produto.id} p={p} />
            </div>

            <details className="mt-4 rounded-md border border-[var(--color-border-secondary)] p-3">
              <summary className="cursor-pointer text-xs font-medium text-jl-fg-2">
                {p.atacado_legado_titulo}
              </summary>
              <div className="mt-3 space-y-3">
                <label className="block text-xs font-medium text-jl-fg-3">
                  {p.preco_atacado}
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${FIN_IN_MONO} mt-1`}
                    value={precoAtacadoInput.display}
                    onChange={precoAtacadoInput.onChange}
                    disabled={saving}
                    placeholder="—"
                  />
                </label>
                <p className="text-[10px] text-jl-fg-3">{p.atacado_legado_hint}</p>
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
            </details>
          </div>
        ) : null}

        {tab === 'fiscal' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <label className="block text-xs font-medium text-jl-fg-3">
                {p.field_ncm}
                <input
                  className={`${FIN_IN_MONO} mt-1`}
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
                  className={`${FIN_IN_MONO} mt-1`}
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
                  className={`${FIN_SELECT} mt-1 font-mono`}
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
                  className={`${FIN_SELECT} mt-1 font-mono`}
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
                  className={`${FIN_SELECT} mt-1 font-mono`}
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
                className={`${FIN_IN_MONO} mt-1`}
                value={cest}
                maxLength={7}
                inputMode="numeric"
                placeholder={p.hint_cest}
                onChange={(e) => setCest(e.target.value.replace(/\D/g, '').slice(0, 7))}
                disabled={saving}
              />
            </label>
          </div>
        ) : null}
      </div>
    </DragonModal>
  )
}
