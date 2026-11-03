'use client'

import { useMemo, type RefObject } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatBRL } from '@/lib/format/money'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import { focusOnEnter } from '../focusOnEnter'
import { CAMPO_INVALIDO_CLASS, CampoErroMsg, erroDoCampo } from '../CampoErro'
import {
  avaliarMargem,
  formatMargemPercentual,
  margemToneClassName,
} from '../produtoForm.margem'
import { FaixasAtacadoEditor } from '../../produtoFormSections/FaixasAtacadoEditor'
import { HistoricoPrecosSection } from '../../produtoFormSections/HistoricoPrecosSection'

type Props = Readonly<{
  precoCustoRef?: RefObject<HTMLInputElement | null>
  precoVarejoRef?: RefObject<HTMLInputElement | null>
  /** Próximo campo da cadeia do Enter depois do varejo (estoque inicial). */
  proximoAposVarejoRef?: RefObject<HTMLInputElement | null>
  onEnterSubmit?: () => void
  /** Cadastro Completo mostra o histórico de preços; Rápido não (produto novo não tem histórico). */
  mostrarHistorico?: boolean
  /** Cadastro Completo: "permitir abaixo do custo" e custo médio ficam junto dos preços (antes numa seção Compra distante). */
  mostrarCompra?: boolean
}>

export function PrecosSection({
  precoCustoRef,
  precoVarejoRef,
  proximoAposVarejoRef,
  onEnterSubmit,
  mostrarHistorico = false,
  mostrarCompra = false,
}: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputMonoClassName, readOnly } = ctx

  const erroVarejo = erroDoCampo(ctx.erro, 'preco_varejo')
  const erroAtacado = erroDoCampo(ctx.erro, 'preco_atacado')

  const varejo = ctx.precoVarejoInput.parse()
  const custo = ctx.precoCustoInput.parse()
  const margem = useMemo(() => avaliarMargem(varejo, custo), [varejo, custo])

  const alerta =
    margem.tom === 'negativa'
      ? p.margem_alerta_negativa
      : margem.tom === 'zero'
        ? p.margem_alerta_zero
        : null

  return (
    <section aria-labelledby="produto-secao-precos">
      <ProdutoFormSectionHeading title={p.secao_precificacao} />
      <p className="mt-1 text-caption text-jl-fg-3">{p.hint_precos_publicar}</p>
      <div id="produto-secao-precos" className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_custo}
            <input
              ref={precoCustoRef}
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.precoCustoInput.display}
              onChange={ctx.precoCustoInput.onChange}
              disabled={disabled}
              placeholder="0,00"
              data-field="preco_custo"
              onKeyDown={(e) => focusOnEnter(e, precoVarejoRef?.current)}
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_varejo} *
            <input
              ref={precoVarejoRef}
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1 ${erroVarejo ? CAMPO_INVALIDO_CLASS : ''}`}
              value={ctx.precoVarejoInput.display}
              onChange={ctx.precoVarejoInput.onChange}
              disabled={disabled}
              placeholder="0,00"
              data-field="preco_varejo"
              aria-invalid={erroVarejo ? true : undefined}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                // Passa pelo estoque inicial antes de salvar; sem ele o campo
                // só era alcançável com mouse/Tab. Ctrl+Enter continua salvando
                // de qualquer campo.
                if (proximoAposVarejoRef?.current) {
                  focusOnEnter(e, proximoAposVarejoRef.current)
                  return
                }
                e.preventDefault()
                onEnterSubmit?.()
              }}
            />
            <CampoErroMsg mensagem={erroVarejo} />
          </label>
        </div>

        {/* Leitura da margem — muda de tom quando o preço dá prejuízo. */}
        <div
          className={`rounded-md border px-3 py-2 ${margemToneClassName(margem.tom)}`}
          data-field="margem"
          data-tom={margem.tom}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium">{p.margem_label}</span>
            <span className="font-mono text-sm font-semibold">
              {margem.valor != null && margem.percentual != null
                ? `${formatBRL(margem.valor)} (${formatMargemPercentual(margem.percentual)}%)`
                : '—'}
            </span>
          </div>
          {alerta ? (
            <p className="mt-1 flex items-start gap-1.5 text-caption font-semibold">
              <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
              {alerta}
            </p>
          ) : margem.tom === 'indefinida' ? (
            <p className="mt-1 text-caption text-jl-fg-3">{p.margem_sem_custo}</p>
          ) : null}
        </div>

        {mostrarCompra ? (
          <div className="space-y-3" data-testid="precos-compra">
            <div>
              <label className="flex h-9 cursor-pointer items-center gap-2 text-xs font-medium text-jl-fg-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-400"
                  checked={ctx.permitirAbaixoCusto}
                  onChange={(e) => ctx.setPermitirAbaixoCusto(e.target.checked)}
                  disabled={disabled}
                />
                {p.permitir_abaixo_custo}
              </label>
              <p className="mt-0.5 text-caption text-jl-fg-3">{p.permitir_abaixo_custo_hint}</p>
            </div>
          </div>
        ) : null}

        {/* Faixa 1 do atacado (preço + qtd. mínima) é a fonte que a RPC de
            criação usa (`p_faixa`) para gravar atomicamente a 1ª linha de
            `precos_atacado` junto com o produto. Com produto já existente,
            a faixa 1 já está persistida e o editor completo assume — por
            isso o campo inline só aparece ANTES do primeiro save. */}
        <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.03] p-3">
          <p className="mb-1 text-caption font-semibold uppercase tracking-wider text-jl-fg-3">
            {p.titulo_faixas_atacado}
          </p>
          {readOnly.produtoId !== null ? (
            <>
              <p className="mb-2 text-caption text-jl-fg-3">{p.hint_faixas_atacado}</p>
              <FaixasAtacadoEditor
                produtoId={readOnly.produtoId}
                p={p}
                precoAtacadoCatalogo={ctx.precoAtacadoInput.parse()}
              />
            </>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-jl-fg-3">
                  {p.preco_atacado}
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${inputMonoClassName} mt-1 ${erroAtacado ? CAMPO_INVALIDO_CLASS : ''}`}
                    value={ctx.precoAtacadoInput.display}
                    onChange={ctx.precoAtacadoInput.onChange}
                    disabled={disabled}
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
                    className={`${inputMonoClassName} mt-1`}
                    value={ctx.quantidadeGatilho}
                    onChange={(e) => ctx.setQuantidadeGatilho(e.target.value.replace(/\D/g, ''))}
                    disabled={disabled}
                    placeholder="0"
                  />
                </label>
              </div>
              <p className="text-caption text-jl-fg-3">{p.hint_faixas_apos_salvar}</p>
            </div>
          )}
        </div>

        {mostrarHistorico && readOnly.produtoId !== null ? (
          <HistoricoPrecosSection produtoId={readOnly.produtoId} p={p} />
        ) : null}
      </div>
    </section>
  )
}
