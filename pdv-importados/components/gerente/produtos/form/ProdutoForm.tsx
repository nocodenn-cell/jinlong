'use client'

import type { RefObject } from 'react'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { FaixasAtacadoEditor } from '../produtoFormSections/FaixasAtacadoEditor'
import {
  defaultFieldClasses,
  ProdutoFormProvider,
  type ProdutoFormContextValue,
} from './ProdutoFormContext'
import type { UseProdutoFormReturn } from './useProdutoForm'
import type { ProdutoFormShellProps } from './produtoForm.types'
import { EssencialSection } from './sections/EssencialSection'
import { ComercialSection } from './sections/ComercialSection'
import { CompraSection } from './sections/CompraSection'
import { EstoqueSection } from './sections/EstoqueSection'
import { FiscalSection } from './sections/FiscalSection'

type Props = ProdutoFormShellProps &
  UseProdutoFormReturn &
  Readonly<{
    nomeRef?: RefObject<HTMLInputElement | null>
    onEnterSubmit?: () => void
    idioma: Idioma
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
    precoVarejoInput: props.precoVarejoInput,
    precoAtacadoInput: props.precoAtacadoInput,
    precoCustoInput: props.precoCustoInput,
  }

  const p = props.m.produtos
  const faixasSlot =
    props.readOnly.produtoId !== null ? (
      <FaixasAtacadoEditor produtoId={props.readOnly.produtoId} p={p} />
    ) : (
      <p className="text-[11px] text-jl-fg-3">{p.hint_faixas_apos_salvar}</p>
    )

  return (
    <ProdutoFormProvider value={ctx}>
      <div className="space-y-1 pb-1">
        <EssencialSection
          nomeRef={props.nomeRef}
          onEnterSubmit={props.onEnterSubmit}
          idioma={props.idioma}
        />
        <ComercialSection faixasSlot={faixasSlot} />
        <CompraSection />
        <EstoqueSection />
        <FiscalSection />
      </div>
    </ProdutoFormProvider>
  )
}
