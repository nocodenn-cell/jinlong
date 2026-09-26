'use client'

import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import { FIN_TEXTAREA } from '../produtoFormStyles'

/**
 * Campos de texto livre / rastreio — só no Cadastro Completo. Separados de
 * Classificação porque são natureza diferente (texto livre vs seleção),
 * não porque mudam de regra de negócio.
 */
export function DetalhesSection() {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputClassName, inputMonoClassName } = ctx

  return (
    <section aria-labelledby="produto-secao-detalhes">
      <ProdutoFormSectionHeading title={p.secao_detalhes} />
      <div id="produto-secao-detalhes" className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.referencia_fornecedor_label}
            <input
              className={`${inputMonoClassName} mt-1`}
              value={ctx.referenciaFornecedor}
              onChange={(e) => ctx.setReferenciaFornecedor(e.target.value)}
              disabled={disabled}
              placeholder={p.referencia_fornecedor_placeholder}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.nome_reduzido_pdv_label}
            <input
              className={`${inputClassName} mt-1`}
              value={ctx.nomeReduzidoPdv}
              onChange={(e) => ctx.setNomeReduzidoPdv(e.target.value)}
              disabled={disabled}
              placeholder={p.nome}
              autoComplete="off"
            />
            <span className="mt-0.5 block text-caption text-jl-fg-3">
              {p.nome_reduzido_pdv_hint}
            </span>
          </label>
        </div>

        <label className="block text-xs font-medium text-jl-fg-3">
          {p.observacao}
          <textarea
            rows={2}
            className={FIN_TEXTAREA}
            value={ctx.observacao}
            onChange={(e) => ctx.setObservacao(e.target.value)}
            disabled={disabled}
            placeholder="—"
          />
        </label>
      </div>
    </section>
  )
}
