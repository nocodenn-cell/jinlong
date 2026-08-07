'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, FolderInput, ToggleLeft, Trash2 } from 'lucide-react'
import {
  alterarAtivoLoteProdutos,
  alterarCategoriaLoteProdutos,
  publicarProdutosLote,
  type OpcoesFiltrosProdutos,
} from '@/app/gerente/produtos/actions'
import { opcoesSelecionaveis } from '@/core/catalog/opcoesCadastro'
import { Button } from '@/components/ui/button'
import { BulkActionBar } from '@/components/ui/BulkActionBar'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import { emitToast } from '@/lib/gerente/toast'
import { interpolateTemplate } from '@/lib/gerente/gerenteCadastroUi'

type Props = Readonly<{
  ids: readonly string[]
  m: Mensagens
  ui: Mensagens['admin_ui']
  opcoes: OpcoesFiltrosProdutos
  onLimpar: () => void
  onExcluir: () => void
}>

/**
 * Barra de ações em lote do catálogo.
 *
 * As server actions já existiam (`publicarProdutosLote`, `alterarAtivoLoteProdutos`,
 * `alterarCategoriaLoteProdutos`) mas ficaram sem UI quando `/gerente/produtos`
 * deixou de ser rota — ver AUDITORIA_CATALOGO_PRODUTO.md §5.2. Aqui elas voltam
 * a ser alcançáveis; nenhuma regra nova.
 */
export function CatalogoLoteToolbar({ ids, m, ui, opcoes, onLimpar, onExcluir }: Props) {
  const p = m.produtos
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [categoriaModal, setCategoriaModal] = useState(false)
  const [categoriaId, setCategoriaId] = useState('')

  if (ids.length === 0) return null

  /**
   * `sucesso` pode vir do argumento (mensagem fixa) ou do próprio resultado —
   * a publicação em lote só sabe quantos publicou depois da resposta, porque o
   * gate no servidor descarta os que não são rascunho.
   */
  const run = (
    fn: () => Promise<{ success: boolean; error?: string; sucesso?: string }>,
    sucesso?: string,
  ) => {
    startTransition(async () => {
      const r = await fn()
      if (!r.success) {
        emitToast({ kind: 'error', message: r.error || m.comum.erro })
        return
      }
      const msg = r.sucesso ?? sucesso
      if (msg) emitToast({ kind: 'success', message: msg })
      onLimpar()
      router.refresh()
    })
  }

  const alvo = [...ids]
  // Categoria inativa não é oferecida para atribuição nova (mesma regra do
  // formulário); aqui não há "categoria atual" a preservar.
  const categorias = opcoesSelecionaveis(opcoes.categorias, '')

  return (
    <>
      <BulkActionBar
        className="mb-3 border-brand/35 bg-[var(--color-info-bg)]"
        selectedCount={ids.length}
        selectedLabel={interpolateTemplate(ui.catalogo_lote_selecionados, { n: String(ids.length) })}
        clearLabel={ui.catalogo_lote_limpar}
        onClear={onLimpar}
      >
        <Button
          type="button"
          size="sm"
          variant="primary"
          className="gap-1.5"
          disabled={pending}
          title={p.publicar_lote}
          onClick={() =>
            run(async () => {
              const r = await publicarProdutosLote(alvo)
              if (!r.success) return { success: false, error: r.error }
              return {
                success: true,
                sucesso: interpolateTemplate(p.publicados_sucesso, {
                  count: String(r.data.publicados),
                }),
              }
            })
          }
        >
          <BadgeCheck size={14} aria-hidden />
          {p.publicar_lote}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          disabled={pending}
          title={p.lote_inativar_title}
          aria-label={p.lote_inativar_aria}
          onClick={() =>
            run(async () => {
              const r = await alterarAtivoLoteProdutos(alvo, false)
              return r.success ? { success: true } : { success: false, error: r.error }
            }, m.comum.sucesso)
          }
        >
          <ToggleLeft size={14} aria-hidden />
          {p.lote_inativar}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          disabled={pending}
          title={p.lote_categoria_title}
          aria-label={p.lote_categoria_aria}
          onClick={() => setCategoriaModal(true)}
        >
          <FolderInput size={14} aria-hidden />
          {p.lote_categoria}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="danger"
          className="gap-1.5"
          disabled={pending}
          title={p.toolbar_excluir_title}
          aria-label={p.toolbar_excluir_aria}
          onClick={onExcluir}
        >
          <Trash2 size={14} aria-hidden />
          {p.toolbar_excluir}
        </Button>
      </BulkActionBar>

      <DragonModal
        open={categoriaModal}
        onClose={() => setCategoriaModal(false)}
        size="sm"
        icon={FolderInput}
        title={p.lote_categoria_title}
        dismissable={!pending}
        closeLabel={m.comum.cancelar}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCategoriaModal(false)}
              disabled={pending}
            >
              {m.comum.cancelar}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() => {
                setCategoriaModal(false)
                run(async () => {
                  const r = await alterarCategoriaLoteProdutos(alvo, categoriaId || null)
                  return r.success ? { success: true } : { success: false, error: r.error }
                }, m.comum.sucesso)
              }}
            >
              {m.comum.salvar}
            </Button>
          </>
        }
      >
        <label className="block text-xs font-medium text-jl-fg-3">
          {interpolateTemplate(p.categoria_lote_label, { n: String(ids.length) })}
          <select
            className="mt-1 w-full rounded-md px-3 py-2 text-sm app-input"
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            disabled={pending}
          >
            <option value="">{p.categoria_lote_sem}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </DragonModal>
    </>
  )
}
