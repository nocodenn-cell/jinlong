'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { useMoneyInput } from '@/hooks/useMoneyInput'
import type { OrigemCode, UnidadeCode } from './produtoForm.types'
import { mapOrigemFromRow, parseGatilhoDisplay, readOnlyFromProduto } from './produtoForm.mappers'

const FISCAL_DEFAULTS = {
  csosn: '400',
  cstPis: '07',
  cstCofins: '07',
} as const

function resetFormState(
  produto: ProdutoGerenteRow | null,
  setters: {
    setNome: (v: string) => void
    setCodigoInterno: (v: string) => void
    setCodigoBarras: (v: string) => void
    setOrigem: (v: OrigemCode) => void
    setUnidadeMedida: (v: UnidadeCode) => void
    setReferenciaFornecedor: (v: string) => void
    setNomeReduzidoPdv: (v: string) => void
    setLocalizacaoPrateleira: (v: string) => void
    setCategoriaId: (v: string) => void
    setMarcaId: (v: string) => void
    setFornecedorId: (v: string) => void
    setObservacao: (v: string) => void
    setQuantidadeGatilho: (v: string) => void
    setPermitirAbaixoCusto: (v: boolean) => void
    setNcm: (v: string) => void
    setCfopProduto: (v: string) => void
    setCsosn: (v: string) => void
    setCest: (v: string) => void
    setCstPis: (v: string) => void
    setCstCofins: (v: string) => void
    precoVarejoInput: ReturnType<typeof useMoneyInput>
    precoAtacadoInput: ReturnType<typeof useMoneyInput>
    precoCustoInput: ReturnType<typeof useMoneyInput>
  },
) {
  if (!produto) {
    setters.setNome('')
    setters.setCodigoInterno('')
    setters.setCodigoBarras('')
    setters.setOrigem('china_manual')
    setters.setUnidadeMedida('UN')
    setters.setReferenciaFornecedor('')
    setters.setNomeReduzidoPdv('')
    setters.setLocalizacaoPrateleira('')
    setters.setCategoriaId('')
    setters.setMarcaId('')
    setters.setFornecedorId('')
    setters.setObservacao('')
    setters.setQuantidadeGatilho('')
    setters.setPermitirAbaixoCusto(false)
    setters.setNcm('')
    setters.setCfopProduto('')
    setters.setCsosn(FISCAL_DEFAULTS.csosn)
    setters.setCest('')
    setters.setCstPis(FISCAL_DEFAULTS.cstPis)
    setters.setCstCofins(FISCAL_DEFAULTS.cstCofins)
    setters.precoVarejoInput.reset()
    setters.precoAtacadoInput.reset()
    setters.precoCustoInput.reset()
    return
  }

  setters.setNome(produto.nome)
  setters.setCodigoInterno(produto.codigo_interno ?? '')
  setters.setCodigoBarras(produto.codigo_barras ?? '')
  setters.setOrigem(mapOrigemFromRow(produto.origem))
  setters.setUnidadeMedida((produto.unidade_medida as UnidadeCode) || 'UN')
  setters.setReferenciaFornecedor(produto.referencia_fornecedor ?? '')
  setters.setNomeReduzidoPdv(produto.nome_reduzido_pdv ?? '')
  setters.setLocalizacaoPrateleira(produto.localizacao_prateleira ?? '')
  setters.setCategoriaId(produto.categoria_id ?? '')
  setters.setMarcaId(produto.marca_id ?? '')
  setters.setFornecedorId(produto.fornecedor_id ?? '')
  setters.setObservacao(produto.observacao ?? '')
  setters.setQuantidadeGatilho(parseGatilhoDisplay(produto.quantidade_gatilho_atacado))
  setters.setPermitirAbaixoCusto(produto.permitir_abaixo_custo)
  setters.setNcm(produto.ncm ?? '')
  setters.setCfopProduto(produto.cfop_produto ?? '')
  setters.setCsosn(produto.csosn ?? FISCAL_DEFAULTS.csosn)
  setters.setCest(produto.cest ?? '')
  setters.setCstPis(produto.cst_pis ?? FISCAL_DEFAULTS.cstPis)
  setters.setCstCofins(produto.cst_cofins ?? FISCAL_DEFAULTS.cstCofins)
  setters.precoVarejoInput.reset(produto.preco_varejo)
  setters.precoAtacadoInput.reset(produto.preco_atacado ?? undefined)
  setters.precoCustoInput.reset(produto.preco_custo ?? undefined)
}

export function useProdutoForm(open: boolean, produto: ProdutoGerenteRow | null) {
  const [nome, setNome] = useState('')
  const [codigoInterno, setCodigoInterno] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [origem, setOrigem] = useState<OrigemCode>('china_manual')
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeCode>('UN')
  const [referenciaFornecedor, setReferenciaFornecedor] = useState('')
  const [nomeReduzidoPdv, setNomeReduzidoPdv] = useState('')
  const [localizacaoPrateleira, setLocalizacaoPrateleira] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [quantidadeGatilho, setQuantidadeGatilho] = useState('')
  const [permitirAbaixoCusto, setPermitirAbaixoCusto] = useState(false)
  const [ncm, setNcm] = useState('')
  const [cfopProduto, setCfopProduto] = useState('')
  const [csosn, setCsosn] = useState<string>(FISCAL_DEFAULTS.csosn)
  const [cest, setCest] = useState('')
  const [cstPis, setCstPis] = useState<string>(FISCAL_DEFAULTS.cstPis)
  const [cstCofins, setCstCofins] = useState<string>(FISCAL_DEFAULTS.cstCofins)
  const [estoqueMinimoInicial, setEstoqueMinimoInicial] = useState('')

  const precoVarejoInput = useMoneyInput()
  const precoAtacadoInput = useMoneyInput()
  const precoCustoInput = useMoneyInput()

  useEffect(() => {
    if (!open) return
    resetFormState(produto, {
      setNome,
      setCodigoInterno,
      setCodigoBarras,
      setOrigem,
      setUnidadeMedida,
      setReferenciaFornecedor,
      setNomeReduzidoPdv,
      setLocalizacaoPrateleira,
      setCategoriaId,
      setMarcaId,
      setFornecedorId,
      setObservacao,
      setQuantidadeGatilho,
      setPermitirAbaixoCusto,
      setNcm,
      setCfopProduto,
      setCsosn,
      setCest,
      setCstPis,
      setCstCofins,
      precoVarejoInput,
      precoAtacadoInput,
      precoCustoInput,
    })
    setEstoqueMinimoInicial('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, produto])

  const readOnly = useMemo(() => readOnlyFromProduto(produto), [produto])

  const limparParaNovoCadastro = useCallback(() => {
    resetFormState(null, {
      setNome,
      setCodigoInterno,
      setCodigoBarras,
      setOrigem,
      setUnidadeMedida,
      setReferenciaFornecedor,
      setNomeReduzidoPdv,
      setLocalizacaoPrateleira,
      setCategoriaId,
      setMarcaId,
      setFornecedorId,
      setObservacao,
      setQuantidadeGatilho,
      setPermitirAbaixoCusto,
      setNcm,
      setCfopProduto,
      setCsosn,
      setCest,
      setCstPis,
      setCstCofins,
      precoVarejoInput,
      precoAtacadoInput,
      precoCustoInput,
    })
    setEstoqueMinimoInicial('')
  }, [precoAtacadoInput, precoCustoInput, precoVarejoInput])

  return {
    nome,
    setNome,
    codigoInterno,
    setCodigoInterno,
    codigoBarras,
    setCodigoBarras,
    origem,
    setOrigem,
    unidadeMedida,
    setUnidadeMedida,
    referenciaFornecedor,
    setReferenciaFornecedor,
    nomeReduzidoPdv,
    setNomeReduzidoPdv,
    localizacaoPrateleira,
    setLocalizacaoPrateleira,
    estoqueMinimoInicial,
    setEstoqueMinimoInicial,
    categoriaId,
    setCategoriaId,
    marcaId,
    setMarcaId,
    fornecedorId,
    setFornecedorId,
    observacao,
    setObservacao,
    quantidadeGatilho,
    setQuantidadeGatilho,
    permitirAbaixoCusto,
    setPermitirAbaixoCusto,
    ncm,
    setNcm,
    cfopProduto,
    setCfopProduto,
    csosn,
    setCsosn,
    cest,
    setCest,
    cstPis,
    setCstPis,
    cstCofins,
    setCstCofins,
    precoVarejoInput,
    precoAtacadoInput,
    precoCustoInput,
    readOnly,
    limparParaNovoCadastro,
  }
}

export type UseProdutoFormReturn = ReturnType<typeof useProdutoForm>
