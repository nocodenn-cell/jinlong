'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Package, Pencil, Printer, Warehouse } from 'lucide-react'
import {
  adminEstoqueProdutoQuery,
  adminEtiquetasProdutoQuery,
} from '@shared-core/navigation/routes'
import {
  atualizarDadosProdutoGerente,
  criarProduto,
  type OpcoesFiltrosProdutos,
} from '@/app/gerente/produtos/actions'
import { criarFaixaAtacado } from '@/app/gerente/produtos/precosAtacadoActions'
import { atualizarEstoqueProduto } from '@/app/gerente/estoque/actions'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { isRascunho, payloadStatusRascunho } from '@/core/catalog/statusPublicacao'
import { buildSubmitPayload, parseGatilhoSubmit } from './form/produtoForm.mappers'
import { validarProdutoFormClient } from './form/produtoForm.clientValidation'
import { ProdutoForm } from './form/ProdutoForm'
import { useProdutoForm } from './form/useProdutoForm'
import { acaoTecladoProduto } from './form/produtoFormKeyboard'

export type ProdutoFormModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  produto: ProdutoGerenteRow | null
  /** Duplicar para criar: semeia um NOVO cadastro a partir deste produto
   *  (limpa código de barras/interno). Ignorado quando `produto` está definido. */
  duplicarDe?: ProdutoGerenteRow | null
  onSaved: () => void
  idioma?: Idioma
}>

type PosSalvarState = Readonly<{
  produtoId: string
  rascunho: boolean
  codigoBarras: string
  estoqueZerado: boolean
}>

/**
 * EXCEÇÃO SSoT (entity-ssot.mdc): estoque inicial permitido **somente** no primeiro save,
 * quando o produto ainda não existe. Após criação, saldo manual → `/admin/estoque` apenas.
 * Não reutilizar este padrão em outros fluxos.
 */
async function aplicarEstoqueInicial(
  produtoId: string,
  qtyRaw: string,
  minRaw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const qty = Number.parseInt(qtyRaw || '0', 10)
  const min = Number.parseInt(minRaw || '0', 10)
  if ((!Number.isFinite(qty) || qty <= 0) && (!Number.isFinite(min) || min <= 0)) {
    return { ok: true }
  }
  const r = await atualizarEstoqueProduto({
    produto_id: produtoId,
    quantidade_atual: Number.isFinite(qty) && qty > 0 ? qty : 0,
    estoque_minimo: Number.isFinite(min) && min > 0 ? min : 0,
    motivo: 'ACERTO_INVENTARIO',
    observacao: 'Estoque inicial no cadastro de produto',
  })
  if (r.ok) return { ok: true }
  return { ok: false, error: r.error }
}

async function sincronizarFaixaAtacado(
  produtoId: string,
  precoAtacado: number | null,
  gatilhoRaw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (precoAtacado == null || precoAtacado <= 0) return { ok: true }
  const gatilho = parseGatilhoSubmit(gatilhoRaw)
  if (gatilho == null) return { ok: true }
  const r = await criarFaixaAtacado({
    produto_id: produtoId,
    quantidade_minima: gatilho,
    preco_unitario: precoAtacado,
  })
  if (r.success) return { ok: true }
  return { ok: false, error: r.error }
}

export function ProdutoFormModal({
  open,
  onOpenChange,
  m,
  opcoes: opcoesIniciais,
  produto,
  duplicarDe = null,
  onSaved,
  idioma = 'pt',
}: ProdutoFormModalProps) {
  const p = m.produtos
  const editando = produto !== null
  const podeSalvarRascunho = !editando || isRascunho(produto?.status_publicacao)
  const nomeRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [opcoes, setOpcoes] = useState(opcoesIniciais)
  const [posSalvar, setPosSalvar] = useState<PosSalvarState | null>(null)
  const [modoCompleto, setModoCompleto] = useState(editando)

  const form = useProdutoForm(open, produto, duplicarDe)

  useEffect(() => {
    if (open) {
      setOpcoes(opcoesIniciais)
      setPosSalvar(null)
      setModoCompleto(editando)
    }
  }, [open, opcoesIniciais, editando])

  useEffect(() => {
    if (!open || posSalvar) return
    requestAnimationFrame(() => nomeRef.current?.focus())
  }, [open, produto?.id, posSalvar])

  const fechar = useCallback(() => {
    if (saving) return
    setPosSalvar(null)
    onOpenChange(false)
  }, [saving, onOpenChange])

  const salvar = useCallback(
    async (opts?: { continuar?: boolean; rascunho?: boolean }) => {
      const precoVarejo = form.precoVarejoInput.parse()
      const precoAtacado = form.precoAtacadoInput.parse()
      const comoRascunho = opts?.rascunho === true

      const erro = validarProdutoFormClient({
        nome: form.nome,
        codigoBarras: form.codigoBarras,
        precoVarejo,
        precoAtacado,
        comoRascunho,
        messages: {
          nome_obrigatorio: p.nome_obrigatorio,
          nome_minimo: p.nome_minimo,
          preco_invalido: p.preco_invalido,
          codigo_barras_minimo: p.codigo_barras_minimo,
          atacado_maior_varejo: p.atacado_maior_varejo,
        },
      })
      if (erro) {
        emitGerenteToast({ kind: 'error', message: erro })
        return
      }

      const payload = {
        ...buildSubmitPayload({
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
          precoVarejo: precoVarejo ?? 0,
          precoAtacado,
          precoCusto: form.precoCustoInput.parse(),
        }),
        ...(comoRascunho ? payloadStatusRascunho() : {}),
      }

      setSaving(true)
      try {
        const r = editando
          ? await atualizarDadosProdutoGerente({ ...payload, produto_id: produto.id })
          : await criarProduto(payload)
        if (!r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
          return
        }

        let estoqueOk = true
        let estoqueErro: string | null = null
        let faixaOk = true
        let faixaErro: string | null = null
        const createdId = !editando && r.data && 'id' in r.data ? r.data.id : null
        if (createdId) {
          const estoqueRes = await aplicarEstoqueInicial(
            createdId,
            form.estoqueInicialQty,
            form.estoqueInicialMin,
          )
          estoqueOk = estoqueRes.ok
          if (!estoqueRes.ok) estoqueErro = estoqueRes.error
          const faixaRes = await sincronizarFaixaAtacado(
            createdId,
            precoAtacado,
            form.quantidadeGatilho,
          )
          faixaOk = faixaRes.ok
          if (!faixaRes.ok) faixaErro = faixaRes.error
        }

        const msg = (() => {
          if (comoRascunho) return p.criado_rascunho
          if (!editando) return p.criado_publicado
          if (isRascunho(produto.status_publicacao)) return p.criado_publicado
          return m.comum.sucesso
        })()
        emitGerenteToast({ kind: 'success', message: msg })
        if (!estoqueOk) {
          emitGerenteToast({
            kind: 'error',
            message: estoqueErro
              ? `${p.erro_estoque_inicial} (${estoqueErro})`
              : p.erro_estoque_inicial,
          })
        }
        if (!faixaOk) {
          emitGerenteToast({
            kind: 'error',
            message: faixaErro
              ? `${p.erro_faixa_inicial} (${faixaErro})`
              : p.erro_faixa_inicial,
          })
        }
        onSaved()

        if (opts?.continuar && !editando) {
          form.limparParaNovoCadastro()
          requestAnimationFrame(() => nomeRef.current?.focus())
          return
        }

        if (createdId) {
          const qty = Number.parseInt(form.estoqueInicialQty || '0', 10)
          setPosSalvar({
            produtoId: createdId,
            rascunho: comoRascunho,
            codigoBarras: form.codigoBarras.trim(),
            estoqueZerado: !Number.isFinite(qty) || qty <= 0,
          })
          return
        }

        onOpenChange(false)
      } finally {
        setSaving(false)
      }
    },
    [editando, produto, form, p, m.comum.sucesso, onSaved, onOpenChange],
  )

  if (!open) return null
  if (editando && !produto) return null

  if (posSalvar) {
    const estoqueHref = adminEstoqueProdutoQuery(
      posSalvar.codigoBarras || form.nome.trim(),
    )
    const etiquetaHref = adminEtiquetasProdutoQuery({
      codigo: posSalvar.codigoBarras || null,
      produtoId: posSalvar.codigoBarras ? null : posSalvar.produtoId,
    })

    return (
      <DragonModal
        open
        onClose={fechar}
        sheet
        size="md"
        icon={Package}
        title={
          posSalvar.rascunho ? p.pos_salvar_titulo_rascunho : p.pos_salvar_titulo_publicado
        }
        dismissable
        closeLabel={m.comum.fechar}
        footer={
          <Button type="button" className="app-btn-accent" onClick={fechar}>
            {m.comum.fechar}
          </Button>
        }
      >
        <p className="text-sm text-jl-fg-2">
          {posSalvar.rascunho ? p.criado_rascunho : p.criado_publicado}
        </p>
        {!posSalvar.rascunho && posSalvar.estoqueZerado ? (
          <p className="mt-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-800">
            {p.aviso_estoque_zero_publicado}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-jl-fg-3">{p.pos_salvar_hint}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={estoqueHref}
            className="app-btn-neutral inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold"
            onClick={fechar}
          >
            <Warehouse size={14} aria-hidden />
            {p.pos_salvar_ajustar_estoque}
          </Link>
          <Link
            href={etiquetaHref}
            className="app-btn-neutral inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold"
            onClick={fechar}
          >
            <Printer size={14} aria-hidden />
            {p.pos_salvar_imprimir_etiqueta}
          </Link>
        </div>
      </DragonModal>
    )
  }

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
          <Button
            type="button"
            variant="secondary"
            className="app-btn-neutral"
            onClick={fechar}
            disabled={saving}
          >
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
              {saving ? '…' : p.salvar_e_continuar}
            </Button>
          ) : null}
          {podeSalvarRascunho ? (
            <Button
              type="button"
              variant="secondary"
              className="app-btn-neutral"
              disabled={saving}
              onClick={() => void salvar({ rascunho: true })}
            >
              {saving ? '…' : p.salvar_rascunho}
            </Button>
          ) : null}
          <Button
            type="button"
            className="app-btn-accent"
            disabled={saving}
            onClick={() => void salvar()}
          >
            {saving
              ? '…'
              : editando && !isRascunho(produto.status_publicacao)
                ? p.editar_modal_salvar
                : p.publicar_no_pdv}
          </Button>
        </>
      }
    >
      <div
        onKeyDown={(e) => {
          const acao = acaoTecladoProduto(e, { editando })
          if (!acao || saving) return
          e.preventDefault()
          if (acao === 'publicar') void salvar()
          else void salvar({ continuar: true })
        }}
      >
        <ProdutoForm
          m={m}
          opcoes={opcoes}
          produto={produto}
          disabled={saving}
          modoCompleto={modoCompleto}
          onToggleModoCompleto={() => setModoCompleto((v) => !v)}
          onFornecedoresChange={(fornecedores) =>
            setOpcoes((prev) => ({ ...prev, fornecedores }))
          }
          onCategoriasChange={(categorias) =>
            setOpcoes((prev) => ({ ...prev, categorias }))
          }
          onMarcasChange={(marcas) => setOpcoes((prev) => ({ ...prev, marcas }))}
          onImagemChange={onSaved}
          idioma={idioma}
          nomeRef={nomeRef}
          onEnterSubmit={() => void salvar()}
          {...form}
        />
      </div>
    </DragonModal>
  )
}
