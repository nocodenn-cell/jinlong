'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { useMoneyInput } from '@/hooks/useMoneyInput'
import { formatDecimalBRL } from '@/lib/format/money'
import type { OrigemCode, UnidadeCode } from './produtoForm.types'
import { mapOrigemFromRow, parseGatilhoDisplay, readOnlyFromProduto } from './produtoForm.mappers'

const FISCAL_DEFAULTS = {
  csosn: '400',
  cstPis: '07',
  cstCofins: '07',
} as const

/** Snapshot comparável dos campos editáveis — usado para detectar alterações não salvas (dirty-check). */
type FormSnapshot = {
  nome: string
  codigoInterno: string
  codigoBarras: string
  origem: OrigemCode
  unidadeMedida: UnidadeCode
  referenciaFornecedor: string
  nomeReduzidoPdv: string
  localizacaoPrateleira: string
  categoriaId: string
  marcaId: string
  fornecedorId: string
  observacao: string
  quantidadeGatilho: string
  permitirAbaixoCusto: boolean
  ncm: string
  cfopProduto: string
  csosn: string
  cest: string
  cstPis: string
  cstCofins: string
  precoVarejo: string
  precoAtacado: string
  precoCusto: string
  estoqueInicialQty: string
  estoqueInicialMin: string
}

function moneyDisplay(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) && value !== 0 ? formatDecimalBRL(value) : ''
}

function buildSnapshot(produto: ProdutoGerenteRow | null): FormSnapshot {
  if (!produto) {
    return {
      nome: '',
      codigoInterno: '',
      codigoBarras: '',
      origem: 'china_manual',
      unidadeMedida: 'UN',
      referenciaFornecedor: '',
      nomeReduzidoPdv: '',
      localizacaoPrateleira: '',
      categoriaId: '',
      marcaId: '',
      fornecedorId: '',
      observacao: '',
      quantidadeGatilho: '',
      permitirAbaixoCusto: false,
      ncm: '',
      cfopProduto: '',
      csosn: FISCAL_DEFAULTS.csosn,
      cest: '',
      cstPis: FISCAL_DEFAULTS.cstPis,
      cstCofins: FISCAL_DEFAULTS.cstCofins,
      precoVarejo: '',
      precoAtacado: '',
      precoCusto: '',
      estoqueInicialQty: '',
      estoqueInicialMin: '',
    }
  }

  return {
    nome: produto.nome,
    codigoInterno: produto.codigo_interno ?? '',
    codigoBarras: produto.codigo_barras ?? '',
    origem: mapOrigemFromRow(produto.origem),
    unidadeMedida: (produto.unidade_medida as UnidadeCode) || 'UN',
    referenciaFornecedor: produto.referencia_fornecedor ?? '',
    nomeReduzidoPdv: produto.nome_reduzido_pdv ?? '',
    localizacaoPrateleira: produto.localizacao_prateleira ?? '',
    categoriaId: produto.categoria_id ?? '',
    marcaId: produto.marca_id ?? '',
    fornecedorId: produto.fornecedor_id ?? '',
    observacao: produto.observacao ?? '',
    quantidadeGatilho: parseGatilhoDisplay(produto.quantidade_gatilho_atacado),
    permitirAbaixoCusto: produto.permitir_abaixo_custo,
    ncm: produto.ncm ?? '',
    cfopProduto: produto.cfop_produto ?? '',
    csosn: produto.csosn ?? FISCAL_DEFAULTS.csosn,
    cest: produto.cest ?? '',
    cstPis: produto.cst_pis ?? FISCAL_DEFAULTS.cstPis,
    cstCofins: produto.cst_cofins ?? FISCAL_DEFAULTS.cstCofins,
    precoVarejo: moneyDisplay(produto.preco_varejo),
    precoAtacado: moneyDisplay(produto.preco_atacado ?? undefined),
    precoCusto: moneyDisplay(produto.preco_custo ?? undefined),
    estoqueInicialQty: '',
    estoqueInicialMin: '',
  }
}

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
    setEstoqueInicialQty: (v: string) => void
    setEstoqueInicialMin: (v: string) => void
  },
): FormSnapshot {
  const snap = buildSnapshot(produto)
  setters.setNome(snap.nome)
  setters.setCodigoInterno(snap.codigoInterno)
  setters.setCodigoBarras(snap.codigoBarras)
  setters.setOrigem(snap.origem)
  setters.setUnidadeMedida(snap.unidadeMedida)
  setters.setReferenciaFornecedor(snap.referenciaFornecedor)
  setters.setNomeReduzidoPdv(snap.nomeReduzidoPdv)
  setters.setLocalizacaoPrateleira(snap.localizacaoPrateleira)
  setters.setCategoriaId(snap.categoriaId)
  setters.setMarcaId(snap.marcaId)
  setters.setFornecedorId(snap.fornecedorId)
  setters.setObservacao(snap.observacao)
  setters.setQuantidadeGatilho(snap.quantidadeGatilho)
  setters.setPermitirAbaixoCusto(snap.permitirAbaixoCusto)
  setters.setNcm(snap.ncm)
  setters.setCfopProduto(snap.cfopProduto)
  setters.setCsosn(snap.csosn)
  setters.setCest(snap.cest)
  setters.setCstPis(snap.cstPis)
  setters.setCstCofins(snap.cstCofins)
  setters.precoVarejoInput.reset(produto?.preco_varejo)
  setters.precoAtacadoInput.reset(produto?.preco_atacado ?? undefined)
  setters.precoCustoInput.reset(produto?.preco_custo ?? undefined)
  setters.setEstoqueInicialQty(snap.estoqueInicialQty)
  setters.setEstoqueInicialMin(snap.estoqueInicialMin)
  return snap
}

export function useProdutoForm(
  open: boolean,
  produto: ProdutoGerenteRow | null,
  duplicarDe: ProdutoGerenteRow | null = null,
  opts?: { codigoBarrasInicial?: string | null },
) {
  const codigoBarrasInicial = opts?.codigoBarrasInicial?.trim() || ''
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
  const [estoqueInicialQty, setEstoqueInicialQty] = useState('')
  const [estoqueInicialMin, setEstoqueInicialMin] = useState('')

  const precoVarejoInput = useMoneyInput()
  const precoAtacadoInput = useMoneyInput()
  const precoCustoInput = useMoneyInput()

  /**
   * Snapshot dos valores logo após o reset — comparado ao estado atual pra
   * saber se o formulário está "sujo" (dirty), sem depender de reler o
   * estado do React em outro effect (haveria uma corrida: o commit do reset
   * só fica visível no próximo render, e um segundo effect com as mesmas
   * deps rodaria no mesmo flush, vendo o valor antigo). Por isso o snapshot
   * é calculado a partir do dado de origem (`produto`/`duplicarDe`), não
   * relido do estado — a mesma fonte que os setters usam.
   */
  const baselineRef = useRef<FormSnapshot | null>(null)

  useEffect(() => {
    if (!open) return
    const setters = {
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
      setEstoqueInicialQty,
      setEstoqueInicialMin,
    }
    if (produto) {
      // Edição: hidrata do produto existente.
      const snap = resetFormState(produto, setters)
      baselineRef.current = snap
    } else if (duplicarDe) {
      // Duplicar para criar: hidrata do produto base como um NOVO cadastro
      // (editando=false) e limpa só o que precisa ser único por item.
      const snap = resetFormState(duplicarDe, setters)
      setCodigoBarras('')
      setCodigoInterno('')
      baselineRef.current = { ...snap, codigoBarras: '', codigoInterno: '' }
    } else {
      // Cadastro em branco.
      const snap = resetFormState(null, setters)
      if (codigoBarrasInicial) {
        setCodigoBarras(codigoBarrasInicial)
        baselineRef.current = { ...snap, codigoBarras: codigoBarrasInicial }
      } else {
        baselineRef.current = snap
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, produto, duplicarDe, codigoBarrasInicial])

  const readOnly = useMemo(() => readOnlyFromProduto(produto), [produto])

  const snapshotAtual = useCallback((): FormSnapshot => {
    return {
      nome,
      codigoInterno,
      codigoBarras,
      origem,
      unidadeMedida,
      referenciaFornecedor,
      nomeReduzidoPdv,
      localizacaoPrateleira,
      categoriaId,
      marcaId,
      fornecedorId,
      observacao,
      quantidadeGatilho,
      permitirAbaixoCusto,
      ncm,
      cfopProduto,
      csosn,
      cest,
      cstPis,
      cstCofins,
      precoVarejo: precoVarejoInput.display,
      precoAtacado: precoAtacadoInput.display,
      precoCusto: precoCustoInput.display,
      estoqueInicialQty,
      estoqueInicialMin,
    }
  }, [
    nome,
    codigoInterno,
    codigoBarras,
    origem,
    unidadeMedida,
    referenciaFornecedor,
    nomeReduzidoPdv,
    localizacaoPrateleira,
    categoriaId,
    marcaId,
    fornecedorId,
    observacao,
    quantidadeGatilho,
    permitirAbaixoCusto,
    ncm,
    cfopProduto,
    csosn,
    cest,
    cstPis,
    cstCofins,
    precoVarejoInput.display,
    precoAtacadoInput.display,
    precoCustoInput.display,
    estoqueInicialQty,
    estoqueInicialMin,
  ])

  /**
   * Após persistência bem-sucedida: o estado atual do formulário passa a ser
   * o baseline limpo. Sem isso, fechar após save dispara "Descartar alterações?".
   */
  const commitBaseline = useCallback(() => {
    baselineRef.current = snapshotAtual()
  }, [snapshotAtual])

  const limparParaNovoCadastro = useCallback(() => {
    // Cadastro em volume: ao "Salvar e continuar", preserva o CONTEXTO que
    // costuma se repetir entre itens (categoria, marca, fornecedor, origem) e
    // limpa só o que é específico do item. Antes resetava tudo, forçando o
    // operador a re-selecionar a categoria a cada produto.
    const contexto = { categoriaId, marcaId, fornecedorId, origem }
    const snap = resetFormState(null, {
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
      setEstoqueInicialQty,
      setEstoqueInicialMin,
    })
    // Reaplica o contexto após o reset (o set posterior vence no batch do React).
    setCategoriaId(contexto.categoriaId)
    setMarcaId(contexto.marcaId)
    setFornecedorId(contexto.fornecedorId)
    setOrigem(contexto.origem)
    baselineRef.current = { ...snap, ...contexto }
  }, [
    categoriaId,
    marcaId,
    fornecedorId,
    origem,
    precoAtacadoInput,
    precoCustoInput,
    precoVarejoInput,
  ])

  const isDirty = useCallback((): boolean => {
    const baseline = baselineRef.current
    if (!baseline) return false
    const current = snapshotAtual()
    return (Object.keys(current) as (keyof FormSnapshot)[]).some(
      (key) => current[key] !== baseline[key],
    )
  }, [snapshotAtual])

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
    estoqueInicialQty,
    setEstoqueInicialQty,
    estoqueInicialMin,
    setEstoqueInicialMin,
    readOnly,
    limparParaNovoCadastro,
    commitBaseline,
    isDirty,
  }
}

export type UseProdutoFormReturn = ReturnType<typeof useProdutoForm>
