'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Package, Pencil } from 'lucide-react'
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
import { ProdutoFormBaseSchema } from '@/app/gerente/produtos/produtoFormSchema'
import { ProdutoImagemCell } from './ProdutoImagemCell'
import { FaixasAtacadoEditor } from './produtoFormSections/FaixasAtacadoEditor'
import { buildSubmitPayload } from './form/produtoForm.mappers'
import { ProdutoForm } from './form/ProdutoForm'
import { useProdutoForm } from './form/useProdutoForm'

type PosCriacao = { id: string; nome: string; imagemUrl: string | null }

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
  const [posCriacao, setPosCriacao] = useState<PosCriacao | null>(null)

  const form = useProdutoForm(open, produto)

  useEffect(() => {
    if (open) setOpcoes(opcoesIniciais)
  }, [open, opcoesIniciais])

  useEffect(() => {
    if (!open) setPosCriacao(null)
  }, [open])

  useEffect(() => {
    if (!open || posCriacao) return
    requestAnimationFrame(() => nomeRef.current?.focus())
  }, [open, produto?.id, posCriacao])

  const fechar = useCallback(() => {
    if (saving) return
    onOpenChange(false)
  }, [saving, onOpenChange])

  const salvar = useCallback(
    async (opts?: { continuar?: boolean }) => {
    const precoVarejo = form.precoVarejo
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
      estoqueMinimoInicial: form.estoqueMinimoInicial,
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
      precoAtacado: form.precoAtacado,
      precoCusto: form.precoCusto,
      temNf: form.readOnly.temNf,
    })

    const validado = ProdutoFormBaseSchema.safeParse(payload)
    if (!validado.success) {
      emitGerenteToast({ kind: 'error', message: validado.error.issues[0]?.message ?? p.preco_invalido })
      return
    }

    setSaving(true)
    try {
      if (editando) {
        const r = await atualizarDadosProdutoGerente({ ...payload, produto_id: produto.id })
        if (!r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }
        emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
        onSaved()
        onOpenChange(false)
        return
      }

      const r = await criarProduto(payload)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: m.comum.sucesso })
      onSaved()
      if (opts?.continuar) {
        form.limparParaNovoCadastro()
        requestAnimationFrame(() => nomeRef.current?.focus())
        return
      }
      setPosCriacao({ id: r.data.id, nome: payload.nome, imagemUrl: null })
    } finally {
      setSaving(false)
    }
  },
    [editando, produto, form, p, m.comum.sucesso, onSaved, onOpenChange],
  )

  const cadastrarOutro = useCallback(() => {
    setPosCriacao(null)
    form.limparParaNovoCadastro()
    requestAnimationFrame(() => nomeRef.current?.focus())
  }, [form])

  if (!open) return null
  if (editando && !produto) return null

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="lg"
      icon={posCriacao ? CheckCircle2 : editando ? Pencil : Package}
      title={posCriacao ? p.produto_criado_titulo : editando ? p.editar_modal_titulo : p.cadastro_produto}
      dismissable={!saving}
      closeLabel={m.comum.cancelar}
      footer={
        posCriacao ? (
          <>
            <Button type="button" variant="secondary" className="app-btn-neutral" onClick={cadastrarOutro}>
              {p.produto_criado_adicionar_outro}
            </Button>
            <Button type="button" className="app-btn-accent" onClick={() => onOpenChange(false)}>
              {m.comum.concluir}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" className="app-btn-neutral" onClick={fechar} disabled={saving}>
              {m.comum.cancelar}
            </Button>
            {!editando ? (
              <Button
                type="button"
                variant="secondary"
                className="app-btn-neutral"
                disabled={saving}
                onClick={() => void salvar({ continuar: true })}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  p.salvar_e_continuar
                )}
              </Button>
            ) : null}
            <Button type="button" className="app-btn-accent" disabled={saving} onClick={() => void salvar()}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : editando ? (
                p.editar_modal_salvar
              ) : (
                m.comum.salvar
              )}
            </Button>
          </>
        )
      }
    >
      {posCriacao ? (
        <div className="space-y-4 pb-1">
          <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            {posCriacao.nome}
          </div>

          <div>
            <p className="text-xs font-medium text-jl-fg-3">{p.foto_secao_upload}</p>
            <p className="mt-0.5 text-[11px] text-jl-fg-3">{p.produto_criado_foto_hint}</p>
            <div className="mt-2">
              <ProdutoImagemCell
                produtoId={posCriacao.id}
                nome={posCriacao.nome}
                imagemUrl={posCriacao.imagemUrl}
                m={m}
                onDone={(novaUrl) => setPosCriacao((atual) => (atual ? { ...atual, imagemUrl: novaUrl } : atual))}
              />
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.03] p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
              {p.titulo_faixas_atacado}
            </p>
            <p className="mb-2 text-[11px] text-jl-fg-3">{p.hint_faixas_atacado}</p>
            <FaixasAtacadoEditor produtoId={posCriacao.id} p={p} />
          </div>
        </div>
      ) : (
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
      )}
    </DragonModal>
  )
}
