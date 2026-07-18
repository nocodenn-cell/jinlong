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
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitGerenteToast } from '@/lib/gerente/toast'
import {
  parseEstoqueInicialIntent,
  resolverFeedbackCadastroEstoque,
} from '@/lib/gerente/estoqueInicialCadastro'
import { buildSubmitPayload, parseGatilhoSubmit } from './form/produtoForm.mappers'
import { validarProdutoFormClient } from './form/produtoForm.clientValidation'
import { ProdutoForm } from './form/ProdutoForm'
import { useProdutoForm } from './form/useProdutoForm'
import {
  resolveProdutoFormStatusChip,
  statusChipClassName,
} from './produtoFormStatusChip'
import {
  emitCadastroDuration,
  fetchSugestaoCadastro,
  fontesLabel,
} from '@/lib/gerente/cadastroSugestaoClient'
import { isGtinLookupCandidate, normalizeGtinDigits } from '@/core/catalog/sugestaoCadastro'

export type ProdutoFormModalProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  opcoes: OpcoesFiltrosProdutos
  produto: ProdutoGerenteRow | null
  onSaved: () => void
  idioma?: Idioma
  codigoBarrasInicial?: string | null
}>

type PosSalvarState = Readonly<{
  produtoId: string
  rascunho: boolean
  codigoBarras: string
  /** Qty pedida era 0 (ou vazia) — aviso preventivo. */
  estoqueZerado: boolean
  /** Pediu estoque inicial e a RPC falhou. */
  estoqueInicialFalhou: boolean
  estoqueErroDetalhe: string | null
}>

/**
 * EXCEÇÃO SSoT (entity-ssot.mdc): estoque inicial só no create — agora via RPC
 * `criar_produto_com_estoque_inicial` (mesma TX). Pós-criação → `/admin/estoque`.
 */

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
  onSaved,
  idioma = 'pt',
  codigoBarrasInicial = null,
}: ProdutoFormModalProps) {
  const p = m.produtos
  const editando = produto !== null
  const podeSalvarRascunho = !editando || produto?.status_publicacao === 'DRAFT'
  const statusChip = resolveProdutoFormStatusChip(
    editando,
    produto?.status_publicacao,
    p,
  )
  const nomeRef = useRef<HTMLInputElement>(null)
  const codigoBarrasRef = useRef<HTMLInputElement>(null)
  const precoVarejoRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [opcoes, setOpcoes] = useState(opcoesIniciais)
  const [posSalvar, setPosSalvar] = useState<PosSalvarState | null>(null)
  const [modoCompleto, setModoCompleto] = useState(editando)
  const [sugestaoHint, setSugestaoHint] = useState<string | null>(null)
  const [knownSuggestion, setKnownSuggestion] = useState(false)
  const [fonteSugestao, setFonteSugestao] = useState<string | null>(null)
  const openedAtRef = useRef(0)
  const lastLookupGtinRef = useRef('')

  const form = useProdutoForm(open, produto, { codigoBarrasInicial })

  useEffect(() => {
    if (open) {
      setOpcoes(opcoesIniciais)
      setPosSalvar(null)
      setModoCompleto(editando)
      setSugestaoHint(null)
      setKnownSuggestion(false)
      setFonteSugestao(null)
      lastLookupGtinRef.current = ''
      openedAtRef.current = Date.now()
    }
  }, [open, opcoesIniciais, editando])

  const aplicarSugestaoBarcode = useCallback(
    async (codigoOverride?: string) => {
      if (editando) return
      const codigo = (codigoOverride ?? form.codigoBarras).trim()
      const digits = normalizeGtinDigits(codigo)
      if (!isGtinLookupCandidate(digits)) return
      if (digits === lastLookupGtinRef.current) return
      lastLookupGtinRef.current = digits
      setSugestaoHint(p.sugestao_buscando)
      const s = await fetchSugestaoCadastro(codigo)
      if (!s || s.jaCadastrado) {
        setSugestaoHint(
          s?.jaCadastrado ? m.caixa.cadastro_rapido_ja_cadastrado : null,
        )
        return
      }
      const fonte = fontesLabel(s.fontes)
      setFonteSugestao(fonte)
      setKnownSuggestion(s.knownSuggestion)
      if (!form.nome.trim() && s.nome) form.setNome(s.nome)
      if (form.precoVarejoInput.parse() == null && s.precoVarejo != null) {
        form.precoVarejoInput.reset(s.precoVarejo)
      }
      if (!form.categoriaId && s.categoriaId) form.setCategoriaId(s.categoriaId)
      if (!form.ncm.trim() && s.ncm) form.setNcm(s.ncm)
      if (form.precoCustoInput.parse() == null && s.precoCusto != null) {
        form.precoCustoInput.reset(s.precoCusto)
      }
      setSugestaoHint(
        s.fontes[0] === 'nenhuma'
          ? null
          : p.sugestao_aplicada.replace('{{fonte}}', fonte),
      )
    },
    [editando, form, p.sugestao_buscando, p.sugestao_aplicada, m.caixa.cadastro_rapido_ja_cadastrado],
  )

  useEffect(() => {
    if (!open || posSalvar) return
    requestAnimationFrame(() => {
      if (!editando) {
        codigoBarrasRef.current?.focus()
        codigoBarrasRef.current?.select()
        return
      }
      nomeRef.current?.focus()
    })
  }, [open, produto?.id, posSalvar, editando])

  useEffect(() => {
    if (!open || editando || posSalvar) return
    const inicial = (codigoBarrasInicial ?? '').trim()
    if (!inicial || !isGtinLookupCandidate(normalizeGtinDigits(inicial))) return
    void aplicarSugestaoBarcode(inicial)
  }, [open, editando, posSalvar, codigoBarrasInicial, aplicarSugestaoBarcode])

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

      const estoqueIntent = parseEstoqueInicialIntent(
        form.estoqueInicialQty,
        form.estoqueInicialMin,
      )
      const clientRequestId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : null

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
        ...(comoRascunho ? { status_publicacao: 'DRAFT' as const } : {}),
        estoque_inicial_quantidade: estoqueIntent.quantidade,
        estoque_inicial_minimo: estoqueIntent.minimo,
        client_request_id: clientRequestId,
      }

      setSaving(true)
      try {
        const r = editando
          ? await atualizarDadosProdutoGerente({ ...payload, produto_id: produto.id })
          : await criarProduto(payload)
        if (!r.success) {
          emitGerenteToast({ kind: 'error', message: r.error })
          if (!editando) {
            emitCadastroDuration({
              surface: 'catalogo_form',
              openedAt: openedAtRef.current,
              knownSuggestion,
              fonteSugestao,
              gtin: normalizeGtinDigits(form.codigoBarras) || null,
              sucesso: false,
            })
          }
          return
        }
        if (!editando) {
          emitCadastroDuration({
            surface: 'catalogo_form',
            openedAt: openedAtRef.current,
            knownSuggestion,
            fonteSugestao,
            gtin: normalizeGtinDigits(form.codigoBarras) || null,
            sucesso: true,
          })
        }

        const estoqueOk = true
        const estoqueErro: string | null = null
        let faixaOk = true
        let faixaErro: string | null = null
        const createdId = !editando && r.data && 'id' in r.data ? r.data.id : null
        if (createdId) {
          const faixaRes = await sincronizarFaixaAtacado(
            createdId,
            precoAtacado,
            form.quantidadeGatilho,
          )
          faixaOk = faixaRes.ok
          if (!faixaRes.ok) faixaErro = faixaRes.error
        }

        const feedbackEstoque = resolverFeedbackCadastroEstoque({
          estoquePedido: Boolean(createdId) && estoqueIntent.deveAplicar,
          estoqueOk,
          estoqueErro,
        })

        if (feedbackEstoque.kind === 'produto_ok_estoque_falhou') {
          const detalhe = feedbackEstoque.errorDetail
          emitGerenteToast({
            kind: 'error',
            message: detalhe
              ? `${p.erro_estoque_inicial} (${detalhe})`
              : p.erro_estoque_inicial,
          })
        } else {
          const msg = (() => {
            if (comoRascunho) return p.criado_rascunho
            if (!editando) return p.criado_publicado
            if (produto.status_publicacao === 'DRAFT') return p.criado_publicado
            return m.comum.sucesso
          })()
          emitGerenteToast({ kind: 'success', message: msg })
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

        const estoqueFalhou = feedbackEstoque.kind === 'produto_ok_estoque_falhou'
        if (opts?.continuar && !editando && !estoqueFalhou) {
          form.limparParaNovoCadastro()
          requestAnimationFrame(() => {
            codigoBarrasRef.current?.focus()
            codigoBarrasRef.current?.select()
          })
          return
        }

        if (createdId) {
          setPosSalvar({
            produtoId: createdId,
            rascunho: comoRascunho,
            codigoBarras: form.codigoBarras.trim(),
            estoqueZerado: !estoqueIntent.deveAplicar || estoqueIntent.quantidade <= 0,
            estoqueInicialFalhou: estoqueFalhou,
            estoqueErroDetalhe: estoqueErro,
          })
          return
        }

        onOpenChange(false)
      } finally {
        setSaving(false)
      }
    },
    [
      editando,
      produto,
      form,
      p,
      m.comum.sucesso,
      onSaved,
      onOpenChange,
      knownSuggestion,
      fonteSugestao,
    ],
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
          posSalvar.estoqueInicialFalhou
            ? p.pos_salvar_titulo_estoque_pendente
            : posSalvar.rascunho
              ? p.pos_salvar_titulo_rascunho
              : p.pos_salvar_titulo_publicado
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
          {posSalvar.estoqueInicialFalhou
            ? p.erro_estoque_inicial
            : posSalvar.rascunho
              ? p.criado_rascunho
              : p.criado_publicado}
        </p>
        {posSalvar.estoqueInicialFalhou && posSalvar.estoqueErroDetalhe ? (
          <p className="mt-2 text-[11px] text-jl-fg-3">{posSalvar.estoqueErroDetalhe}</p>
        ) : null}
        {posSalvar.estoqueInicialFalhou ? (
          <p className="mt-2 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            {p.pos_salvar_hint_estoque_falhou}
          </p>
        ) : null}
        {!posSalvar.rascunho &&
        !posSalvar.estoqueInicialFalhou &&
        posSalvar.estoqueZerado ? (
          <p className="mt-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-800">
            {p.aviso_estoque_zero_publicado}
          </p>
        ) : null}
        {!posSalvar.estoqueInicialFalhou ? (
          <p className="mt-2 text-xs text-jl-fg-3">{p.pos_salvar_hint}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={estoqueHref}
            className={
              posSalvar.estoqueInicialFalhou
                ? 'app-btn-accent inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold'
                : 'app-btn-neutral inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold'
            }
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

  const ctaPrincipalLabel = p.salvar_produto

  return (
    <DragonModal
      open
      onClose={fechar}
      sheet
      size="lg"
      icon={editando ? Pencil : Package}
      title={editando ? p.editar_modal_titulo : p.cadastro_produto}
      subtitle={
        <span className="flex flex-col gap-1">
          <span
            className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusChipClassName(statusChip.tone)}`}
          >
            {statusChip.label}
          </span>
          <span className="text-[11px] font-normal text-jl-fg-3">{statusChip.hint}</span>
        </span>
      }
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
              {saving ? '…' : p.salvar_e_novo}
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
            {saving ? '…' : ctaPrincipalLabel}
          </Button>
        </>
      }
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
        codigoBarrasRef={codigoBarrasRef}
        precoVarejoRef={precoVarejoRef}
        onEnterSubmit={() => void salvar()}
        onCodigoBarrasBlur={() => void aplicarSugestaoBarcode()}
        sugestaoHint={sugestaoHint}
        {...form}
      />
    </DragonModal>
  )
}
