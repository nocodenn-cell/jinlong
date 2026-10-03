'use client'

import type { RefObject } from 'react'
import type { Idioma } from '@/idioma/normalizeIdioma'
import {
  defaultFieldClasses,
  ProdutoFormProvider,
  type ProdutoFormContextValue,
} from './ProdutoFormContext'
import type { UseProdutoFormReturn } from './useProdutoForm'
import type { ProdutoFormShellProps } from './produtoForm.types'
import type { ProdutoFormErro } from './produtoForm.clientValidation'
import { EssencialSection } from './sections/EssencialSection'
import { PrecosSection } from './sections/PrecosSection'
import { CategoriaQuickField } from './sections/CategoriaQuickField'
import { FornecedorQuickField } from './sections/FornecedorQuickField'
import { EstoqueSection } from './sections/EstoqueSection'

type Props = ProdutoFormShellProps &
  UseProdutoFormReturn &
  Readonly<{
    nomeRef?: RefObject<HTMLInputElement | null>
    codigoBarrasRef?: RefObject<HTMLInputElement | null>
    precoCustoRef?: RefObject<HTMLInputElement | null>
    precoVarejoRef?: RefObject<HTMLInputElement | null>
    estoqueInicialRef?: RefObject<HTMLInputElement | null>
    erro?: ProdutoFormErro | null
    onEnterSubmit?: () => void
    onCodigoBarrasBlur?: () => void
    sugestaoHint?: string | null
    idioma: Idioma
  }>

/**
 * Cadastro Rápido — conjunto FIXO de campos, sem toggle de "mais detalhes".
 * Marca, origem, referência de fornecedor, nome reduzido PDV, observação,
 * permitir-abaixo-do-custo e dados fiscais não aparecem aqui por desenho —
 * ver `docs/PLANO_CADASTRO_PRODUTO_UX.md` (v2) para a decisão e a evidência
 * de que nenhum desses campos é exigido para o produto existir, vender,
 * estocar ou entrar na fila fiscal. Quem precisar deles usa o Cadastro
 * Completo (`ProdutoFormCompleto`).
 */
export function ProdutoFormRapido(props: Props) {
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
    buscarNomesSimilares: props.buscarNomesSimilares,
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

  return (
    <ProdutoFormProvider value={ctx}>
      <div className="space-y-1 pb-1">
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
          precoCustoRef={props.precoCustoRef}
          precoVarejoRef={props.precoVarejoRef}
          proximoAposVarejoRef={props.estoqueInicialRef}
          onEnterSubmit={props.onEnterSubmit}
        />
        {/* Categoria e fornecedor sempre visíveis — campos primários: categoria
            organiza o catálogo, fornecedor mantém a rastreabilidade da compra. */}
        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CategoriaQuickField />
          <FornecedorQuickField idioma={props.idioma} />
        </div>
        <EstoqueSection
          estoqueInicialRef={props.estoqueInicialRef}
          onEnterSubmit={props.onEnterSubmit}
        />
      </div>
    </ProdutoFormProvider>
  )
}
