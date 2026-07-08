'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Package, Pencil } from 'lucide-react'
import {
  atualizarDadosProdutoGerente,
  criarProduto,
  type OpcoesFiltrosProdutos,
} from '@/app/gerente/produtos/actions'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { buildSubmitPayload } from './form/produtoForm.mappers'
import { ProdutoForm } from './form/ProdutoForm'
import { useProdutoForm } from './form/useProdutoForm'

export type ProdutoFormModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  /** null = criar; preenchido = editar */
  produto: ProdutoGerenteRow | null
  onSaved: () => void
  idioma?: Idioma
}>

export function ProdutoFormModal({
  open,
  onOpenChange,
  m,
  opcoes: opcoesIniciais,
  produto,
  onSaved,
  idioma = 'pt',
}: ProdutoFormModalProps) {
  const p = m.produtos
  const editando = produto !== null
  const nomeRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [opcoes, setOpcoes] = useState(opcoesIniciais)

  const form = useProdutoForm(open, produto)

  useEffect(() => {
    if (open) setOpcoes(opcoesIniciais)
  }, [open, opcoesIniciais])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => nomeRef.current?.focus())
  }, [open, produto?.id])

  const fechar = useCallback(() => {
    if (saving) return
    onOpenChange(false)
  }, [saving, onOpenChange])

  const salvar = useCallback(async () => {
    const precoVarejo = form.precoVarejoInput.parse()
    if (!precoVarejo || precoVarejo <= 0) {
      emitGerenteToast({ kind: 'error', message: p.preco_invalido })
      return
    }
    if (!form.nome.trim()) {
      emitGerenteToast({ kind: 'error', message: p.nome_obrigatorio })
      return
    }

    const payload = buildSubmitPayload({
      nome: form.nome,
      codigoBarras: form.codigoBarras,
      codigoInterno: form.codigoInterno,
      referenciaFornecedor: form.referenciaFornecedor,
      nomeReduzidoPdv: form.nomeReduzidoPdv,
      localizacaoPrateleira: form.localizacaoPrateleira,
      origem: form.origem,
      unidadeMedida: form.unidadeMedida,
      categoriaId: form.categoriaId,
      marcaId: form.marcaId,
      fornecedorId: form.fornecedorId,
      observacao: form.observacao,
      quantidadeGatilho: form.quantidadeGatilho,
      permitirAbaixoCusto: form.permitirAbaixoCusto,
      ncm: form.ncm,
      cfopProduto: form.cfopProduto,
      csosn: form.csosn,
      cest: form.cest,
      cstPis: form.cstPis,
      cstCofins: form.cstCofins,
      precoVarejo,
      precoAtacado: form.precoAtacadoInput.parse(),
      precoCusto: form.precoCustoInput.parse(),
      temNf: form.readOnly.temNf,
    })

    setSaving(true)
    try {
      const r = editando
        ? await atualizarDadosProdutoGerente({ ...payload, produto_id: produto.id })
        : await criarProduto(payload)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
      onSaved()
      fechar()
    } finally {
      setSaving(false)
    }
  }, [editando, produto, form, p, m.comum.sucesso, onSaved, fechar])

  if (!open) return null
  if (editando && !produto) return null

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="lg"
      icon={editando ? Pencil : Package}
      title={editando ? p.editar_modal_titulo : p.cadastro_produto}
      dismissable={!saving}
      closeLabel={m.comum.cancelar}
      footer={
        <>
          <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={saving}>
            {m.comum.cancelar}
          </Button>
          <Button type="button" className="app-btn-accent" disabled={saving} onClick={() => void salvar()}>
            {saving ? '…' : editando ? p.editar_modal_salvar : m.comum.salvar}
          </Button>
        </>
      }
    >
      <ProdutoForm
        m={m}
        opcoes={opcoes}
        produto={produto}
        disabled={saving}
        onFornecedoresChange={(fornecedores) => setOpcoes((prev) => ({ ...prev, fornecedores }))}
        idioma={idioma}
        nomeRef={nomeRef}
        onEnterSubmit={() => void salvar()}
        {...form}
      />
    </DragonModal>
  )
}
