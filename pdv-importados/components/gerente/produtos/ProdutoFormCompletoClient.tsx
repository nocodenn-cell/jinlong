'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ROUTES, adminCatalogoCompletoEditarHref } from '@/lib/navigation/routes'
import type { OpcoesFiltrosProdutos } from '@/lib/gerente/produtos/opcoesFiltrosTypes'
import type { ProdutoGerenteRow } from '@/lib/gerente/produtos/produtoGerenteTypes'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { useProdutoFormOrchestration } from './form/useProdutoFormOrchestration'
import { ProdutoFormCompleto } from './form/ProdutoFormCompleto'

export type ProdutoFormCompletoClientProps = Readonly<{
  produtoInicial: ProdutoGerenteRow | null
  /** Duplicar para criar: semeia um NOVO cadastro a partir deste produto (limpa código). Ignorado quando `produtoInicial` está definido. */
  duplicarDe?: ProdutoGerenteRow | null
  opcoes: OpcoesFiltrosProdutos
  m: Mensagens
  idioma: Idioma
}>

/**
 * Container de página do Cadastro Completo — equivalente ao que
 * `ProdutoFormModal` é para o Cadastro Rápido, mas sem `DragonModal`: layout
 * de página normal, barra de ações no rodapé do card, guarda de saída via o
 * mesmo diálogo de "descartar alterações" (é um primitivo de UI genérico,
 * não exclusivo de modal).
 */
export function ProdutoFormCompletoClient({
  produtoInicial,
  duplicarDe = null,
  opcoes,
  m,
  idioma,
}: ProdutoFormCompletoClientProps) {
  const router = useRouter()
  const p = m.produtos
  const editando = produtoInicial !== null

  const orch = useProdutoFormOrchestration({
    open: true,
    produto: produtoInicial,
    duplicarDe,
    opcoesIniciais: opcoes,
    m,
    onSaved: () => router.refresh(),
    onOpenChange: (open) => {
      if (!open) router.push(ROUTES.admin.catalogo)
    },
  })

  /**
   * O Completo não tem tela "pós-salvar" própria (isso é UX do Cadastro
   * Rápido, ligada ao balcão/scanner). Ao criar, ele simplesmente VIRA a
   * tela de edição do produto recém-criado — é aqui que faixas extras,
   * imagem e histórico de preço passam a existir (dependem de `produtoId`).
   */
  useEffect(() => {
    if (orch.posSalvar && !editando) {
      router.replace(adminCatalogoCompletoEditarHref(orch.posSalvar.produtoId))
    }
  }, [orch.posSalvar, editando, router])

  const titulo = editando ? p.editar_modal_titulo : p.cadastro_produto

  return (
    <div className="admin-v2-page">
      <PageHeader
        title={titulo}
        subtitle={editando ? produtoInicial.nome : undefined}
        actions={
          <Link
            href={ROUTES.admin.catalogo}
            className="inline-flex items-center gap-1.5 text-caption font-medium text-fg-subtle hover:text-fg"
          >
            <ArrowLeft size={14} aria-hidden />
            {m.comum.voltar}
          </Link>
        }
      />

      <SectionCard>
        <div ref={orch.formWrapRef}>
          <ProdutoFormCompleto
            m={m}
            opcoes={orch.opcoes}
            produto={produtoInicial}
            disabled={orch.saving}
            erro={orch.erroCampo}
            idioma={idioma}
            imagemUrl={orch.imagemUrl}
            onImagemChange={orch.onImagemChange}
            onFornecedoresChange={orch.onFornecedoresChange}
            onCategoriasChange={orch.onCategoriasChange}
            onMarcasChange={orch.onMarcasChange}
            {...orch.form}
          />
        </div>

        <div
          className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border-secondary)] bg-[var(--color-surface)] py-3"
          data-testid="produto-completo-acoes"
        >
          <Button type="button" variant="secondary" onClick={orch.fechar} disabled={orch.saving}>
            {m.comum.cancelar}
          </Button>
          {orch.podeSalvarRascunho ? (
            <Button
              type="button"
              variant="secondary"
              disabled={orch.saving}
              onClick={() => void orch.salvar({ rascunho: true })}
            >
              {orch.saving ? '…' : p.salvar_rascunho}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="primary"
            disabled={orch.saving}
            onClick={() => void orch.salvar()}
          >
            {orch.saving ? '…' : editando ? p.editar_modal_salvar : p.salvar_produto}
          </Button>
        </div>
      </SectionCard>

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
    </div>
  )
}
