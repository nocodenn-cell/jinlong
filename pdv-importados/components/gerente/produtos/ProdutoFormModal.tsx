'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, Package, Printer, Warehouse } from 'lucide-react'
import {
  adminCatalogoCompletoEditarHref,
  adminEstoqueProdutoQuery,
  adminEtiquetasProdutoQuery,
} from '@shared-core/navigation/routes'
import type { OpcoesFiltrosProdutos } from '@/lib/gerente/produtos/opcoesFiltrosTypes'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { ProdutoFormRapido } from './form/ProdutoFormRapido'
import { useProdutoFormOrchestration } from './form/useProdutoFormOrchestration'
import { acaoTecladoProduto } from './form/produtoFormKeyboard'
import { FaixasAtacadoEditor } from './produtoFormSections/FaixasAtacadoEditor'

export type ProdutoFormModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  onSaved: () => void
  idioma?: Idioma
  codigoBarrasInicial?: string | null
}>

/**
 * Cadastro Rápido — modal, sempre criação (nunca edita; editar e duplicar
 * usam o Cadastro Completo, `ProdutoFormCompletoClient`). Ver
 * `docs/PLANO_CADASTRO_PRODUTO_UX.md` (v2) para o porquê da divisão.
 */
export function ProdutoFormModal({
  open,
  onOpenChange,
  m,
  opcoes: opcoesIniciais,
  onSaved,
  idioma = 'pt',
  codigoBarrasInicial = null,
}: ProdutoFormModalProps) {
  const p = m.produtos
  const nomeRef = useRef<HTMLInputElement>(null)
  const codigoBarrasRef = useRef<HTMLInputElement>(null)
  const precoCustoRef = useRef<HTMLInputElement>(null)
  const precoVarejoRef = useRef<HTMLInputElement>(null)
  const estoqueInicialRef = useRef<HTMLInputElement>(null)
  const [mostrarFaixasAdicionais, setMostrarFaixasAdicionais] = useState(false)

  const orch = useProdutoFormOrchestration({
    open,
    produto: null,
    codigoBarrasInicial,
    opcoesIniciais,
    m,
    onSaved,
    onOpenChange,
  })

  useEffect(() => {
    if (!open || orch.posSalvar) return
    setMostrarFaixasAdicionais(false)
    requestAnimationFrame(() => {
      codigoBarrasRef.current?.focus()
      codigoBarrasRef.current?.select()
    })
    // `orch.continuarTick` dispara o mesmo refoco após "Salvar e continuar":
    // o form limpa e permanece aberto (sem posSalvar), então nem `open` nem
    // `posSalvar` mudam — sem esse gatilho o operador perderia o foco no
    // código de barras entre um item e o próximo no cadastro em volume.
  }, [open, orch.posSalvar, orch.continuarTick])

  if (!open) return null

  if (orch.posSalvar) {
    const posSalvar = orch.posSalvar
    const estoqueHref = adminEstoqueProdutoQuery(posSalvar.codigoBarras || orch.form.nome.trim())
    const etiquetaHref = adminEtiquetasProdutoQuery({
      codigo: posSalvar.codigoBarras || null,
      produtoId: posSalvar.codigoBarras ? null : posSalvar.produtoId,
    })
    /** Publicado mas com saldo 0 — o caixa vai recusar até ajustar o estoque. */
    const estoquePendenteParaVender =
      !posSalvar.rascunho && !posSalvar.estoqueInicialFalhou && posSalvar.estoqueZerado

    return (
      <DragonModal
        open
        onClose={orch.fechar}
        sheet
        size="md"
        icon={Package}
        title={
          posSalvar.estoqueInicialFalhou
            ? p.pos_salvar_titulo_estoque_pendente
            : posSalvar.rascunho
              ? p.pos_salvar_titulo_rascunho
              : p.pos_salvar_titulo_publicado
        }
        dismissable
        closeLabel={m.comum.fechar}
        footer={
          <Button type="button" variant="primary" onClick={orch.fechar}>
            {m.comum.fechar}
          </Button>
        }
      >
        <p className="text-sm text-jl-fg-2">
          {posSalvar.estoqueInicialFalhou
            ? p.erro_estoque_inicial
            : posSalvar.rascunho
              ? p.criado_rascunho
              : p.criado_publicado}
        </p>
        {posSalvar.estoqueInicialFalhou && posSalvar.estoqueErroDetalhe ? (
          <p className="mt-2 text-caption text-fg-subtle">{posSalvar.estoqueErroDetalhe}</p>
        ) : null}
        {posSalvar.estoqueInicialFalhou ? (
          <p className="mt-2 rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-caption text-[var(--color-danger-strong)]">
            {p.pos_salvar_hint_estoque_falhou}
          </p>
        ) : null}
        {estoquePendenteParaVender ? (
          <p className="mt-2 rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-caption text-[var(--color-warning-strong)]">
            {p.aviso_estoque_zero_publicado}
          </p>
        ) : null}
        {!posSalvar.estoqueInicialFalhou ? (
          <p className="mt-2 text-caption text-jl-fg-3">
            {estoquePendenteParaVender ? p.pos_salvar_hint_estoque_obrigatorio : p.pos_salvar_hint}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            asChild
            variant={
              posSalvar.estoqueInicialFalhou || estoquePendenteParaVender ? 'primary' : 'secondary'
            }
            size="sm"
            className="gap-1.5"
          >
            <Link href={estoqueHref} onClick={orch.fechar}>
              <Warehouse size={14} aria-hidden />
              {p.pos_salvar_ajustar_estoque}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="gap-1.5">
            <Link href={etiquetaHref} onClick={orch.fechar}>
              <Printer size={14} aria-hidden />
              {p.pos_salvar_imprimir_etiqueta}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="gap-1.5">
            <Link href={adminCatalogoCompletoEditarHref(posSalvar.produtoId)} onClick={orch.fechar}>
              <ClipboardList size={14} aria-hidden />
              {p.pos_salvar_completar_cadastro}
            </Link>
          </Button>
        </div>

        {/* Fluxo pós-save OPCIONAL de faixas adicionais — não é etapa
            obrigatória: quem só quis 1 faixa (ou nenhuma) já terminou. Reusa
            FaixasAtacadoEditor tal como o Cadastro Completo, sem RPC nova. */}
        <div className="mt-4 border-t border-[var(--color-border-secondary)] pt-4">
          {mostrarFaixasAdicionais ? (
            <>
              <p className="mb-2 text-xs font-medium text-jl-fg-2">{p.titulo_faixas_atacado}</p>
              <FaixasAtacadoEditor produtoId={posSalvar.produtoId} p={p} precoAtacadoCatalogo={null} />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMostrarFaixasAdicionais(true)}
              className="text-caption font-medium text-jl-accent hover:underline"
            >
              {p.pos_salvar_configurar_faixas}
            </button>
          )}
        </div>
      </DragonModal>
    )
  }

  return (
    <>
      <DragonModal
        open
        onClose={orch.fechar}
        sheet
        size="lg"
        icon={Package}
        title={p.cadastro_rapido_produto_titulo}
        dismissable={!orch.saving}
        closeLabel={m.comum.cancelar}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={orch.fechar} disabled={orch.saving}>
              {m.comum.cancelar}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={orch.saving}
              onClick={() => void orch.salvar({ continuar: true })}
            >
              {orch.saving ? '…' : p.salvar_e_novo}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={orch.saving}
              onClick={() => void orch.salvar()}
            >
              {orch.saving ? '…' : p.salvar_produto}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-caption text-jl-fg-3">{p.cadastro_rapido_descricao}</p>
        <div
          ref={orch.formWrapRef}
          onKeyDown={(e) => {
            const acao = acaoTecladoProduto(e, { editando: false })
            if (!acao || orch.saving) return
            e.preventDefault()
            if (acao === 'publicar') void orch.salvar()
            else void orch.salvar({ continuar: true })
          }}
        >
          <ProdutoFormRapido
            m={m}
            opcoes={orch.opcoes}
            produto={null}
            disabled={orch.saving}
            erro={orch.erroCampo}
            idioma={idioma}
            nomeRef={nomeRef}
            codigoBarrasRef={codigoBarrasRef}
            precoCustoRef={precoCustoRef}
            precoVarejoRef={precoVarejoRef}
            estoqueInicialRef={estoqueInicialRef}
            onEnterSubmit={() => void orch.salvar()}
            onCodigoBarrasBlur={() => void orch.aplicarSugestaoBarcode()}
            sugestaoHint={orch.sugestaoHint}
            onFornecedoresChange={orch.onFornecedoresChange}
            onCategoriasChange={orch.onCategoriasChange}
            onMarcasChange={orch.onMarcasChange}
            {...orch.form}
          />
        </div>
      </DragonModal>

      <DragonModal
        open={orch.confirmDescartarOpen}
        onClose={() => orch.setConfirmDescartarOpen(false)}
        variant="danger"
        size="sm"
        title={p.confirm_descartar_titulo}
        dismissable
        closeLabel={m.comum.fechar}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => orch.setConfirmDescartarOpen(false)}
            >
              {p.confirm_descartar_continuar}
            </Button>
            <Button type="button" variant="danger" onClick={orch.fecharDeVerdade}>
              {p.confirm_descartar_confirmar}
            </Button>
          </>
        }
      >
        <p className="text-sm text-jl-fg-2">{p.confirm_descartar_texto}</p>
      </DragonModal>
    </>
  )
}
