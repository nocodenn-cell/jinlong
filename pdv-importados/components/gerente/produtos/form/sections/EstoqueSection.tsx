'use client'

import type { RefObject } from 'react'
import Link from 'next/link'
import { unidadeAceitaFracao } from '@shared-core/src/products/unidadesMedida'
import { ROUTES } from '@/lib/navigation/routes'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import { CAMPO_INVALIDO_CLASS, CampoErroMsg, erroDoCampo } from '../CampoErro'

function LeituraCampo({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-jl-fg-3">{label}</p>
      <p className="mt-1 text-sm font-medium text-jl-fg-1">{value}</p>
      {hint ? <p className="mt-0.5 text-caption text-jl-fg-3">{hint}</p> : null}
    </div>
  )
}

type Props = Readonly<{
  estoqueInicialRef?: RefObject<HTMLInputElement | null>
  onEnterSubmit?: () => void
}>

export function EstoqueSection({ estoqueInicialRef, onEnterSubmit }: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputClassName, inputMonoClassName, readOnly } = ctx
  const isCreate = readOnly.produtoId === null
  const erroEstoqueInicial = erroDoCampo(ctx.erro, 'estoque_inicial')
  const erroEstoqueMinimo = erroDoCampo(ctx.erro, 'estoque_minimo')
  const estoqueZero =
    !isCreate && readOnly.estoqueAtual !== null && readOnly.estoqueAtual <= 0

  return (
    <section aria-labelledby="produto-secao-estoque">
      <ProdutoFormSectionHeading title={p.secao_estoque} />
      <div id="produto-secao-estoque" className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.localizacao_prateleira_label}
          <input
            className={`${inputClassName} mt-1`}
            value={ctx.localizacaoPrateleira}
            onChange={(e) => ctx.setLocalizacaoPrateleira(e.target.value)}
            disabled={disabled}
            placeholder={p.localizacao_prateleira_placeholder}
            autoComplete="off"
          />
        </label>

        {isCreate ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-jl-fg-3">
              {/* Unidade no rótulo: sem ela o operador digita "10" sem saber se
                  são 10 unidades, 10 caixas ou 10 quilos. */}
              {p.estoque_inicial_label}{' '}
              <span className="font-mono text-caption text-jl-fg-2">
                ({ctx.unidadeMedida})
              </span>
              <input
                ref={estoqueInicialRef}
                type="text"
                inputMode={unidadeAceitaFracao(ctx.unidadeMedida) ? 'decimal' : 'numeric'}
                className={`${inputMonoClassName} mt-1 ${erroEstoqueInicial ? CAMPO_INVALIDO_CLASS : ''}`}
                value={ctx.estoqueInicialQty}
                onChange={(e) => ctx.setEstoqueInicialQty(e.target.value)}
                disabled={disabled}
                placeholder="0"
                data-field="estoque_inicial"
                aria-invalid={erroEstoqueInicial ? true : undefined}
                onKeyDown={
                  onEnterSubmit
                    ? (e) => {
                        if (e.key !== 'Enter') return
                        e.preventDefault()
                        onEnterSubmit()
                      }
                    : undefined
                }
              />
              <span className="mt-0.5 block text-caption text-jl-fg-3">
                {p.hint_estoque_inicial}
              </span>
              <CampoErroMsg mensagem={erroEstoqueInicial} />
            </label>
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.estoque_minimo_label}
              <input
                type="text"
                inputMode={unidadeAceitaFracao(ctx.unidadeMedida) ? 'decimal' : 'numeric'}
                className={`${inputMonoClassName} mt-1 ${erroEstoqueMinimo ? CAMPO_INVALIDO_CLASS : ''}`}
                value={ctx.estoqueInicialMin}
                onChange={(e) => ctx.setEstoqueInicialMin(e.target.value)}
                disabled={disabled}
                placeholder="0"
                data-field="estoque_minimo"
                aria-invalid={erroEstoqueMinimo ? true : undefined}
              />
              <CampoErroMsg mensagem={erroEstoqueMinimo} />
            </label>
          </div>
        ) : (
          <>
            {estoqueZero ? (
              <p className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-caption text-amber-800">
                {p.aviso_estoque_zero}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 rounded-md border border-[var(--color-border-secondary)] bg-white/[.04] p-3">
              <LeituraCampo
                label={p.estoque_atual_label}
                value={
                  readOnly.estoqueAtual !== null ? String(readOnly.estoqueAtual) : '—'
                }
              />
              <LeituraCampo
                label={p.estoque_minimo_label}
                value={
                  readOnly.estoqueMinimo !== null ? String(readOnly.estoqueMinimo) : '—'
                }
                hint={p.estoque_minimo_hint}
              />
            </div>
            <Link
              href={ROUTES.admin.estoque}
              className="inline-flex text-caption font-medium text-jl-accent hover:underline"
            >
              {p.estoque_minimo_link}
            </Link>
          </>
        )}
      </div>
    </section>
  )
}
