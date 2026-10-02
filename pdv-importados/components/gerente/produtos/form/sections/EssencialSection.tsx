'use client'

import { useState, type RefObject } from 'react'
import { eanComDvSuspeito, nomeJaExiste } from '@/lib/validacao/documentos'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import { focusOnEnter } from '../focusOnEnter'
import { CAMPO_INVALIDO_CLASS, CampoErroMsg, erroDoCampo } from '../CampoErro'
import type { UnidadeCode } from '../produtoForm.types'

type Props = Readonly<{
  nomeRef?: RefObject<HTMLInputElement | null>
  codigoBarrasRef?: RefObject<HTMLInputElement | null>
  /** Próximo campo da cadeia do Enter depois do nome (preço de custo). */
  proximoAposNomeRef?: RefObject<HTMLInputElement | null>
  onCodigoBarrasBlur?: () => void
  sugestaoHint?: string | null
}>

export function EssencialSection({
  nomeRef,
  codigoBarrasRef,
  proximoAposNomeRef,
  onCodigoBarrasBlur,
  sugestaoHint,
}: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputClassName, inputMonoClassName, selectClassName } = ctx

  const erroNome = erroDoCampo(ctx.erro, 'nome')
  // Avisos NÃO bloqueantes (UX-020): nome repetido no catálogo e EAN com dígito verificador errado.
  const [nomeDuplicado, setNomeDuplicado] = useState(false)
  const avisoEan = eanComDvSuspeito(ctx.codigoBarras)

  async function verificarNomeDuplicado() {
    const nome = ctx.nome.trim()
    if (nome.length < 2 || !ctx.buscarNomesSimilares) {
      setNomeDuplicado(false)
      return
    }
    try {
      const rows = await ctx.buscarNomesSimilares(nome)
      if (!rows) return
      setNomeDuplicado(rows.some((row) => row.id !== ctx.produto?.id && nomeJaExiste(nome, [row.nome])))
    } catch {
      /* aviso é opcional: falha de rede não atrapalha o cadastro */
    }
  }
  const erroBarras = erroDoCampo(ctx.erro, 'codigo_barras')

  return (
    <section aria-labelledby="produto-secao-essencial">
      <ProdutoFormSectionHeading title={p.secao_essencial} />
      <p className="mt-1 text-caption text-jl-fg-3">{p.hint_cadastro_scanner}</p>
      <div id="produto-secao-essencial" className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.codigo_barras}
          <input
            ref={codigoBarrasRef}
            className={`${inputMonoClassName} mt-1 ${erroBarras ? CAMPO_INVALIDO_CLASS : ''}`}
            value={ctx.codigoBarras}
            onChange={(e) => ctx.setCodigoBarras(e.target.value)}
            disabled={disabled}
            placeholder={p.codigo_barras_opcional}
            autoComplete="off"
            data-field="codigo_barras"
            aria-invalid={erroBarras ? true : undefined}
            onBlur={() => onCodigoBarrasBlur?.()}
            onKeyDown={(e) => focusOnEnter(e, nomeRef?.current)}
          />
          <CampoErroMsg mensagem={erroBarras} />
          {avisoEan && !erroBarras ? (
            <span className="mt-1 block text-caption text-[var(--color-warning-strong)]" data-testid="aviso-ean">
              {p.aviso_ean_dv}
            </span>
          ) : null}
          {sugestaoHint ? (
            <span className="mt-1 block text-caption font-medium text-jl-accent">{sugestaoHint}</span>
          ) : null}
        </label>

        <label className="block text-xs font-medium text-jl-fg-3">
          {p.nome} *
          <input
            ref={nomeRef}
            className={`${inputClassName} mt-1 ${erroNome ? CAMPO_INVALIDO_CLASS : ''}`}
            value={ctx.nome}
            onChange={(e) => ctx.setNome(e.target.value)}
            disabled={disabled}
            placeholder={p.nome}
            autoComplete="off"
            data-field="nome"
            aria-invalid={erroNome ? true : undefined}
            onBlur={() => void verificarNomeDuplicado()}
            onKeyDown={(e) => focusOnEnter(e, proximoAposNomeRef?.current)}
          />
          <CampoErroMsg mensagem={erroNome} />
          {nomeDuplicado && !erroNome ? (
            <span className="mt-1 block text-caption text-[var(--color-warning-strong)]" data-testid="aviso-nome-duplicado">
              {p.aviso_nome_duplicado}
            </span>
          ) : null}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.unidade_medida}
            <select
              className={`${selectClassName} mt-1`}
              value={ctx.unidadeMedida}
              onChange={(e) => ctx.setUnidadeMedida(e.target.value as UnidadeCode)}
              disabled={disabled}
              data-field="unidade_medida"
            >
              <option value="UN">{p.unidade_medida_un}</option>
              <option value="KG">{p.unidade_medida_kg}</option>
              <option value="CX">{p.unidade_medida_cx}</option>
              <option value="FD">{p.unidade_medida_fd}</option>
              <option value="M">{p.unidade_medida_m}</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.codigo_interno_label}
            <input
              className={`${inputMonoClassName} mt-1`}
              value={ctx.codigoInterno}
              onChange={(e) => ctx.setCodigoInterno(e.target.value)}
              disabled={disabled}
              placeholder={p.codigo_interno_placeholder}
              autoComplete="off"
            />
          </label>
        </div>
      </div>
    </section>
  )
}
