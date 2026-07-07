'use client'

import type { RefObject } from 'react'
import type { Mensagens } from '@/i18n/getMessages'

type OrigemCode = 'china_manual' | 'brasil_nf'
type UnidadeCode = 'UN' | 'KG' | 'CX' | 'FD' | 'M'
type Opcao = { id: string; nome: string }

type Props = Readonly<{
  p: Mensagens['produtos']
  nome: string
  onChangeNome: (value: string) => void
  nomeRef?: RefObject<HTMLInputElement | null>
  onEnterSubmit?: () => void
  codigoInterno: string
  onChangeCodigoInterno: (value: string) => void
  codigoBarras: string
  onChangeCodigoBarras: (value: string) => void
  origem: OrigemCode
  onChangeOrigem: (value: OrigemCode) => void
  categoriaId: string
  onChangeCategoriaId: (value: string) => void
  categorias: Opcao[]
  unidadeMedida: UnidadeCode
  onChangeUnidadeMedida: (value: UnidadeCode) => void
  marcaId: string
  onChangeMarcaId: (value: string) => void
  marcas: Opcao[]
  referenciaFornecedor: string
  onChangeReferenciaFornecedor: (value: string) => void
  nomeReduzidoPdv: string
  onChangeNomeReduzidoPdv: (value: string) => void
  disabled: boolean
  inputClassName: string
  inputMonoClassName: string
  selectClassName: string
}>

/** Aba "Dados básicos": identificação + campos comerciais do produto. Todos os
 *  campos além de nome/preço são opcionais — produtos antigos sem esses dados
 *  continuam editáveis normalmente. */
export function DadosBasicosTab(props: Props) {
  const { p, disabled, inputClassName, inputMonoClassName, selectClassName } = props

  return (
    <div className="space-y-4">
      <label className="block text-xs font-medium text-jl-fg-3">
        {p.nome} *
        <input
          ref={props.nomeRef}
          className={`${inputClassName} mt-1`}
          value={props.nome}
          onChange={(e) => props.onChangeNome(e.target.value)}
          disabled={disabled}
          placeholder={p.nome}
          autoComplete="off"
          onKeyDown={
            props.onEnterSubmit
              ? (e) => { if (e.key === 'Enter') { e.preventDefault(); props.onEnterSubmit?.() } }
              : undefined
          }
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.codigo_interno_label}
          <input
            className={`${inputMonoClassName} mt-1`}
            value={props.codigoInterno}
            onChange={(e) => props.onChangeCodigoInterno(e.target.value)}
            disabled={disabled}
            placeholder={p.codigo_interno_placeholder}
            autoComplete="off"
          />
        </label>
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.codigo_barras}
          <input
            className={`${inputMonoClassName} mt-1`}
            value={props.codigoBarras}
            onChange={(e) => props.onChangeCodigoBarras(e.target.value)}
            disabled={disabled}
            placeholder={p.codigo_barras_opcional}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.categoria_label}
          <select
            className={`${selectClassName} mt-1`}
            value={props.categoriaId}
            onChange={(e) => props.onChangeCategoriaId(e.target.value)}
            disabled={disabled}
          >
            <option value="">{p.nenhuma_categoria}</option>
            {props.categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.unidade_medida}
          <select
            className={`${selectClassName} mt-1`}
            value={props.unidadeMedida}
            onChange={(e) => props.onChangeUnidadeMedida(e.target.value as UnidadeCode)}
            disabled={disabled}
          >
            <option value="UN">{p.unidade_medida_un}</option>
            <option value="KG">{p.unidade_medida_kg}</option>
            <option value="CX">{p.unidade_medida_cx}</option>
            <option value="FD">{p.unidade_medida_fd}</option>
            <option value="M">{p.unidade_medida_m}</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.marca_label}
          <select
            className={`${selectClassName} mt-1`}
            value={props.marcaId}
            onChange={(e) => props.onChangeMarcaId(e.target.value)}
            disabled={disabled}
          >
            <option value="">{p.nenhuma_marca}</option>
            {props.marcas.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.origem_label}
          <select
            className={`${selectClassName} mt-1`}
            value={props.origem}
            onChange={(e) => props.onChangeOrigem(e.target.value as OrigemCode)}
            disabled={disabled}
          >
            <option value="china_manual">{p.origem_china}</option>
            <option value="brasil_nf">{p.origem_brasil_nf}</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.referencia_fornecedor_label}
          <input
            className={`${inputMonoClassName} mt-1`}
            value={props.referenciaFornecedor}
            onChange={(e) => props.onChangeReferenciaFornecedor(e.target.value)}
            disabled={disabled}
            placeholder={p.referencia_fornecedor_placeholder}
            autoComplete="off"
          />
        </label>
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.nome_reduzido_pdv_label}
          <input
            className={`${inputClassName} mt-1`}
            value={props.nomeReduzidoPdv}
            onChange={(e) => props.onChangeNomeReduzidoPdv(e.target.value)}
            disabled={disabled}
            placeholder={p.nome}
            autoComplete="off"
          />
        </label>
      </div>
      <p className="text-[10px] text-jl-fg-3">{p.nome_reduzido_pdv_hint}</p>
    </div>
  )
}
