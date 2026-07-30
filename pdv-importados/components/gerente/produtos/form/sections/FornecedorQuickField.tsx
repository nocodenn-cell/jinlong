'use client'

import { FornecedorCombobox } from '../fields/FornecedorCombobox'
import { useProdutoFormContext } from '../ProdutoFormContext'
import type { Idioma } from '@/idioma/normalizeIdioma'

type Props = Readonly<{
  idioma: Idioma
}>

/**
 * Fornecedor com busca + cadastro rápido — SEMPRE visível (modo simples e
 * completo). Estava atrás do "Mais detalhes", o que na prática significava
 * cadastrar produto sem fornecedor e perder a rastreabilidade da compra e da
 * reposição. Mesmo tratamento que a categoria já recebeu.
 * Fonte única: é o único ponto onde o fornecedor é editado no formulário.
 */
export function FornecedorQuickField({ idioma }: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, selectClassName, opcoes } = ctx

  return (
    <div>
      <p className="text-xs font-medium text-jl-fg-3">{p.fornecedor_principal_label}</p>
      <div className="mt-1">
        <FornecedorCombobox
          p={p}
          fornecedores={opcoes.fornecedores}
          value={ctx.fornecedorId}
          onChange={ctx.setFornecedorId}
          onFornecedoresChange={ctx.onFornecedoresChange}
          disabled={disabled}
          selectClassName={selectClassName}
          idioma={idioma}
        />
      </div>
      <p className="mt-0.5 text-[10px] text-jl-fg-3">{p.hint_fornecedor_rastreio}</p>
    </div>
  )
}
