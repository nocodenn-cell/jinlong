'use client'

import type { RefObject } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { FaixasAtacadoEditor } from '../produtoFormSections/FaixasAtacadoEditor'
import { HistoricoPrecosSection } from '../produtoFormSections/HistoricoPrecosSection'
import { ProdutoImagemCell } from '../ProdutoImagemCell'
import {
  defaultFieldClasses,
  ProdutoFormProvider,
  type ProdutoFormContextValue,
} from './ProdutoFormContext'
import type { UseProdutoFormReturn } from './useProdutoForm'
import type { ProdutoFormShellProps } from './produtoForm.types'
import type { ProdutoFormErro } from './produtoForm.clientValidation'
import { CAMPO_INVALIDO_CLASS, CampoErroMsg, erroDoCampo } from './CampoErro'
import { EssencialSection } from './sections/EssencialSection'
import { PrecosSection } from './sections/PrecosSection'
import { CategoriaQuickField } from './sections/CategoriaQuickField'
import { FornecedorQuickField } from './sections/FornecedorQuickField'
import { ComercialSection } from './sections/ComercialSection'
import { CompraSection } from './sections/CompraSection'
import { EstoqueSection } from './sections/EstoqueSection'
import { FiscalSection } from './sections/FiscalSection'

type Props = ProdutoFormShellProps &
  UseProdutoFormReturn &
  Readonly<{
    nomeRef?: RefObject<HTMLInputElement | null>
    codigoBarrasRef?: RefObject<HTMLInputElement | null>
    precoCustoRef?: RefObject<HTMLInputElement | null>
    precoVarejoRef?: RefObject<HTMLInputElement | null>
    estoqueInicialRef?: RefObject<HTMLInputElement | null>
    erro?: ProdutoFormErro | null
    /** URL corrente da foto (controlada pelo modal para refletir upload/remoção na hora). */
    imagemUrl?: string | null
    onEnterSubmit?: () => void
    onCodigoBarrasBlur?: () => void
    sugestaoHint?: string | null
    idioma: Idioma
    modoCompleto: boolean
    onToggleModoCompleto: () => void
  }>

export function ProdutoForm(props: Props) {
  const fields = defaultFieldClasses()
  const ctx: ProdutoFormContextValue = {
    m: props.m,
    opcoes: props.opcoes,
    produto: props.produto,
    readOnly: props.readOnly,
    disabled: props.disabled,
    onFornecedoresChange: props.onFornecedoresChange,
    onCategoriasChange: props.onCategoriasChange,
    onMarcasChange: props.onMarcasChange,
    erro: props.erro,
    ...fields,
    nome: props.nome,
    setNome: props.setNome,
    codigoInterno: props.codigoInterno,
    setCodigoInterno: props.setCodigoInterno,
    codigoBarras: props.codigoBarras,
    setCodigoBarras: props.setCodigoBarras,
    origem: props.origem,
    setOrigem: props.setOrigem,
    unidadeMedida: props.unidadeMedida,
    setUnidadeMedida: props.setUnidadeMedida,
    referenciaFornecedor: props.referenciaFornecedor,
    setReferenciaFornecedor: props.setReferenciaFornecedor,
    nomeReduzidoPdv: props.nomeReduzidoPdv,
    setNomeReduzidoPdv: props.setNomeReduzidoPdv,
    localizacaoPrateleira: props.localizacaoPrateleira,
    setLocalizacaoPrateleira: props.setLocalizacaoPrateleira,
    categoriaId: props.categoriaId,
    setCategoriaId: props.setCategoriaId,
    marcaId: props.marcaId,
    setMarcaId: props.setMarcaId,
    fornecedorId: props.fornecedorId,
    setFornecedorId: props.setFornecedorId,
    observacao: props.observacao,
    setObservacao: props.setObservacao,
    quantidadeGatilho: props.quantidadeGatilho,
    setQuantidadeGatilho: props.setQuantidadeGatilho,
    permitirAbaixoCusto: props.permitirAbaixoCusto,
    setPermitirAbaixoCusto: props.setPermitirAbaixoCusto,
    ncm: props.ncm,
    setNcm: props.setNcm,
    cfopProduto: props.cfopProduto,
    setCfopProduto: props.setCfopProduto,
    csosn: props.csosn,
    setCsosn: props.setCsosn,
    cest: props.cest,
    setCest: props.setCest,
    cstPis: props.cstPis,
    setCstPis: props.setCstPis,
    cstCofins: props.cstCofins,
    setCstCofins: props.setCstCofins,
    icmsOrigem: props.icmsOrigem,
    setIcmsOrigem: props.setIcmsOrigem,
    precoVarejoInput: props.precoVarejoInput,
    precoAtacadoInput: props.precoAtacadoInput,
    precoCustoInput: props.precoCustoInput,
    estoqueInicialQty: props.estoqueInicialQty,
    setEstoqueInicialQty: props.setEstoqueInicialQty,
    estoqueInicialMin: props.estoqueInicialMin,
    setEstoqueInicialMin: props.setEstoqueInicialMin,
  }

  const p = props.m.produtos
  const erroAtacado = erroDoCampo(props.erro, 'preco_atacado')
  const faixasSlot =
    props.readOnly.produtoId !== null ? (
      <FaixasAtacadoEditor
        produtoId={props.readOnly.produtoId}
        p={p}
        precoAtacadoCatalogo={props.precoAtacadoInput.parse()}
      />
    ) : (
      // Cadastro rápido: sem produtoId ainda, a tabela precos_atacado não tem
      // como ser editada (FaixasAtacadoEditor exige um produto existente).
      // Estes 2 campos alimentam `p_faixa` na RPC de criação
      // (criar_produto_com_estoque_inicial, Onda 2 · Bloco 4): a 1ª faixa é
      // criada ATOMICAMENTE junto com o produto, sem precisar salvar/reabrir/
      // editar depois. Faixas extras exigem o produto já existir (acima).
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_atacado}
            <input
              type="text"
              inputMode="decimal"
              className={`${fields.inputMonoClassName} mt-1 ${erroAtacado ? CAMPO_INVALIDO_CLASS : ''}`}
              value={props.precoAtacadoInput.display}
              onChange={props.precoAtacadoInput.onChange}
              disabled={props.disabled}
              placeholder="0,00"
              data-field="preco_atacado"
              aria-invalid={erroAtacado ? true : undefined}
            />
            <CampoErroMsg mensagem={erroAtacado} />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.qtd_gatilho_atacado}
            <input
              type="text"
              inputMode="numeric"
              className={`${fields.inputMonoClassName} mt-1`}
              value={props.quantidadeGatilho}
              onChange={(e) => props.setQuantidadeGatilho(e.target.value.replace(/\D/g, ''))}
              disabled={props.disabled}
              placeholder="0"
            />
          </label>
        </div>
        <p className="text-caption text-jl-fg-3">{p.hint_faixas_apos_salvar}</p>
      </div>
    )
  const historicoSlot =
    props.readOnly.produtoId !== null ? (
      <HistoricoPrecosSection produtoId={props.readOnly.produtoId} p={p} />
    ) : null

  return (
    <ProdutoFormProvider value={ctx}>
      <div className="space-y-1 pb-1">
        {props.readOnly.produtoId && props.produto ? (
          <div className="mb-3 flex items-center gap-3 rounded-md border border-jl-border-1 bg-jl-surface-soft p-3">
            <ProdutoImagemCell
              produtoId={props.produto.id}
              nome={props.produto.nome}
              imagemUrl={
                props.imagemUrl !== undefined ? props.imagemUrl : props.produto.imagem_url
              }
              disabled={props.disabled}
              m={props.m}
              onDone={(url) => props.onImagemChange?.(url)}
            />
            <div>
              <p className="text-xs font-medium text-jl-fg-2">{p.foto_form_label}</p>
              <p className="text-caption text-jl-fg-3">{p.hint_foto_form}</p>
            </div>
          </div>
        ) : null}

        {/* Cadeia do Enter no cadastro rápido, na mesma ordem visual:
            código → nome → custo → venda → estoque inicial → salvar. */}
        <EssencialSection
          nomeRef={props.nomeRef}
          codigoBarrasRef={props.codigoBarrasRef}
          proximoAposNomeRef={props.precoCustoRef}
          onCodigoBarrasBlur={props.onCodigoBarrasBlur}
          sugestaoHint={props.sugestaoHint}
        />
        <PrecosSection
          modoCompleto={props.modoCompleto}
          precoCustoRef={props.precoCustoRef}
          precoVarejoRef={props.precoVarejoRef}
          proximoAposVarejoRef={props.estoqueInicialRef}
          onEnterSubmit={props.onEnterSubmit}
        />
        {/* Categoria e fornecedor sempre visíveis (modo simples e completo) —
            campos primários: categoria organiza o catálogo, fornecedor mantém a
            rastreabilidade da compra. */}
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CategoriaQuickField />
          <FornecedorQuickField idioma={props.idioma} />
        </div>
        <EstoqueSection
          modoCompleto={props.modoCompleto}
          estoqueInicialRef={props.estoqueInicialRef}
          onEnterSubmit={props.onEnterSubmit}
        />

        <button
          type="button"
          onClick={props.onToggleModoCompleto}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-jl-border-1 bg-jl-surface-soft px-3 py-2 text-xs font-semibold text-jl-fg-2 transition hover:border-primary hover:text-primary"
        >
          {props.modoCompleto ? (
            <>
              <ChevronUp size={14} aria-hidden />
              {p.modo_compacto}
            </>
          ) : (
            <>
              <ChevronDown size={14} aria-hidden />
              {p.modo_completo}
            </>
          )}
        </button>

        {props.modoCompleto ? (
          <>
            <ComercialSection faixasSlot={faixasSlot} historicoSlot={historicoSlot} />
            <CompraSection />
            <FiscalSection />
          </>
        ) : null}
      </div>
    </ProdutoFormProvider>
  )
}
