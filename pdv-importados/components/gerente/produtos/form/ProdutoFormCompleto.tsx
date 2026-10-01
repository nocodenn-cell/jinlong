'use client'

import type { Idioma } from '@/idioma/normalizeIdioma'
import { ProdutoImagemCell } from '../ProdutoImagemCell'
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
import { ClassificacaoSection } from './sections/ClassificacaoSection'
import { DetalhesSection } from './sections/DetalhesSection'
import { FiscalSection } from './sections/FiscalSection'

type Props = ProdutoFormShellProps &
  UseProdutoFormReturn &
  Readonly<{
    erro?: ProdutoFormErro | null
    idioma: Idioma
    /** URL corrente da foto (controlada pelo container para refletir upload/remoção na hora). */
    imagemUrl?: string | null
    onImagemChange?: (imagemUrl: string | null) => void
  }>

/**
 * Cadastro Completo — TODAS as seções, sempre visíveis, sem disclosure (nem
 * toggle, nem `<details>`). É o único lugar onde marca, origem, referência de
 * fornecedor, nome reduzido PDV, observação, permitir-abaixo-do-custo e os
 * campos fiscais são editáveis — ver `docs/PLANO_CADASTRO_PRODUTO_UX.md` (v2).
 */
export function ProdutoFormCompleto(props: Props) {
  const fields = defaultFieldClasses()
  const p = props.m.produtos
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

  return (
    <ProdutoFormProvider value={ctx}>
      <div className="space-y-6 pb-1">
        {props.readOnly.produtoId && props.produto ? (
          <div className="flex items-center gap-3 rounded-md border border-jl-border-1 bg-jl-surface-soft p-3">
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

        <EssencialSection />
        <PrecosSection mostrarHistorico mostrarCompra />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CategoriaQuickField />
          <FornecedorQuickField idioma={props.idioma} />
        </div>
        <EstoqueSection />
        <ClassificacaoSection />
        <DetalhesSection />
        <FiscalSection />
      </div>
    </ProdutoFormProvider>
  )
}
