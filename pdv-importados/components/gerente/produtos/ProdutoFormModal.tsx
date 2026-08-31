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
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'
import { obterAutoriaProduto, type ProdutoAutoria } from '@/app/gerente/produtos/produtoAutoriaActions'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { emitGerenteToast } from '@/lib/gerente/toast'
import {
  parseEstoqueInicialIntent,
  resolverFeedbackCadastroEstoque,
} from '@/lib/gerente/estoqueInicialCadastro'
import {
  isRascunho,
  payloadStatusRascunho,
  podeSalvarComoRascunho,
} from '@/core/catalog/statusPublicacao'
import { buildSubmitPayload } from './form/produtoForm.mappers'
import {
  validarProdutoFormClient,
  type ProdutoFormErro,
} from './form/produtoForm.clientValidation'
import { campoExigeModoCompleto, localizarCampo } from './form/produtoForm.campoFoco'
import { ProdutoForm } from './form/ProdutoForm'
import { useProdutoForm } from './form/useProdutoForm'
import { mergeOpcoesFiltrosPreservandoLocal } from './form/mergeOpcoesFiltros'
import { acaoTecladoProduto } from './form/produtoFormKeyboard'
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
  /** Duplicar para criar: semeia um NOVO cadastro a partir deste produto
   *  (limpa código de barras/interno). Ignorado quando `produto` está definido. */
  duplicarDe?: ProdutoGerenteRow | null
  onSaved: () => void
  /**
   * Foto trocada/removida — evento independente de "produto salvo". O consumidor
   * deve só recarregar a lista: fechar o modal aqui descartaria os campos que o
   * operador ainda não salvou. Sem handler, a troca de foto não recarrega nada
   * (o formulário continua aberto, que é o comportamento seguro).
   */
  onImagemAtualizada?: () => void
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

const autoriaDtFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function formatAutoriaLine(
  template: string,
  nome: string | null,
  dataIso: string | null,
  fallbackNome: string,
): string | null {
  if (!dataIso) return null
  return template
    .replace('{{nome}}', nome ?? fallbackNome)
    .replace('{{data}}', autoriaDtFmt.format(new Date(dataIso)))
}

export function ProdutoFormModal({
  open,
  onOpenChange,
  m,
  opcoes: opcoesIniciais,
  produto,
  duplicarDe = null,
  onSaved,
  onImagemAtualizada,
  idioma = 'pt',
  codigoBarrasInicial = null,
}: ProdutoFormModalProps) {
  const p = m.produtos
  const editando = produto !== null
  const podeSalvarRascunho = podeSalvarComoRascunho(editando, produto?.status_publicacao)
  const statusChip = resolveProdutoFormStatusChip(
    editando,
    produto?.status_publicacao,
    p,
  )
  const nomeRef = useRef<HTMLInputElement>(null)
  const codigoBarrasRef = useRef<HTMLInputElement>(null)
  const precoCustoRef = useRef<HTMLInputElement>(null)
  const precoVarejoRef = useRef<HTMLInputElement>(null)
  const estoqueInicialRef = useRef<HTMLInputElement>(null)
  const formWrapRef = useRef<HTMLDivElement>(null)
  const [erroCampo, setErroCampo] = useState<ProdutoFormErro | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDescartarOpen, setConfirmDescartarOpen] = useState(false)
  const [autoria, setAutoria] = useState<ProdutoAutoria | null>(null)
  const [opcoes, setOpcoes] = useState(opcoesIniciais)
  const [posSalvar, setPosSalvar] = useState<PosSalvarState | null>(null)
  const [modoCompleto, setModoCompleto] = useState(editando)
  const [imagemUrl, setImagemUrl] = useState<string | null>(produto?.imagem_url ?? null)
  const [sugestaoHint, setSugestaoHint] = useState<string | null>(null)
  const [knownSuggestion, setKnownSuggestion] = useState(false)
  const [fonteSugestao, setFonteSugestao] = useState<string | null>(null)
  const openedAtRef = useRef(0)
  const lastLookupGtinRef = useRef('')
  /** Detecta abertura real do modal (false→true) para resetar opções às props. */
  const estavaAbertoRef = useRef(false)

  const form = useProdutoForm(open, produto, duplicarDe, { codigoBarrasInicial })

  /**
   * Reinicializa o "chrome" do modal só quando o formulário abre de verdade
   * (ou troca o produto em edição). NÃO depende de `opcoesIniciais`: um
   * `router.refresh()` pós-save muda as opções e, se limpar `posSalvar` aqui,
   * o operador volta à tela de edição dirty e vê "Descartar alterações?".
   */
  useEffect(() => {
    if (!open) return
    setPosSalvar(null)
    setErroCampo(null)
    setModoCompleto(editando)
    setImagemUrl(produto?.imagem_url ?? null)
    setSugestaoHint(null)
    setKnownSuggestion(false)
    setFonteSugestao(null)
    lastLookupGtinRef.current = ''
    openedAtRef.current = Date.now()
  }, [open, editando, produto?.id, produto?.imagem_url])

  /**
   * Opções auxiliares: na abertura real, espelha as props.
   * Enquanto o modal permanece aberto, merge por id — refresh RSC/cache stale
   * não pode apagar categoria/marca/fornecedor criados localmente no formulário.
   */
  useEffect(() => {
    if (!open) {
      estavaAbertoRef.current = false
      return
    }
    const acabouDeAbrir = !estavaAbertoRef.current
    estavaAbertoRef.current = true
    if (acabouDeAbrir) {
      setOpcoes(opcoesIniciais)
      return
    }
    setOpcoes((prev) => mergeOpcoesFiltrosPreservandoLocal(prev, opcoesIniciais))
  }, [open, opcoesIniciais])

  useEffect(() => {
    if (!open || !editando || !produto) {
      setAutoria(null)
      return
    }
    let cancelado = false
    // Best-effort e não-bloqueante — é só uma informação extra no cabeçalho;
    // falhar aqui (rede, ambiente sem sessão de request) não pode quebrar o
    // resto do formulário nem virar unhandled rejection.
    obterAutoriaProduto(produto.id)
      .then((r) => {
        if (!cancelado && r.success) setAutoria(r.data)
      })
      .catch(() => {
        // silencioso — autoria fica null, as linhas correspondentes somem.
      })
    return () => {
      cancelado = true
    }
  }, [open, editando, produto])

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
        setSugestaoHint(s?.jaCadastrado ? p.err_codigo_barras_duplicado : null)
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
    [editando, form, p.sugestao_buscando, p.sugestao_aplicada, p.err_codigo_barras_duplicado],
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

  /**
   * Leva o operador até o campo reprovado. Roda como efeito (não no handler)
   * porque o campo pode estar dentro de "Mais detalhes": o `setModoCompleto`
   * do handler só virou DOM depois do commit, e é aqui que ele já existe.
   */
  useEffect(() => {
    if (!erroCampo) return
    const el = localizarCampo(formWrapRef.current, erroCampo.campo)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.focus()
    if (el instanceof HTMLInputElement) el.select()
  }, [erroCampo])

  /**
   * Limpa a reprovação quando o operador mexe em qualquer campo validado —
   * borda vermelha em campo já corrigido é ruído.
   */
  useEffect(() => {
    setErroCampo(null)
  }, [
    form.nome,
    form.codigoBarras,
    form.precoVarejoInput.display,
    form.precoAtacadoInput.display,
  ])

  const fecharDeVerdade = useCallback(() => {
    setPosSalvar(null)
    setErroCampo(null)
    setConfirmDescartarOpen(false)
    onOpenChange(false)
  }, [onOpenChange])

  /**
   * Sem posSalvar (formulário ainda em edição) e com alterações não salvas,
   * pede confirmação antes de descartar — cobre X, Esc, clique no backdrop e
   * o botão "Cancelar" do footer, que passam todos por aqui via `onClose`.
   * Após save bem-sucedido, `commitBaseline()` deixa isDirty=false; a tela
   * pós-salvar (`posSalvar`) também bypassa o guard.
   */
  const fechar = useCallback(() => {
    if (saving) return
    if (!posSalvar && form.isDirty()) {
      setConfirmDescartarOpen(true)
      return
    }
    fecharDeVerdade()
  }, [saving, posSalvar, form, fecharDeVerdade])

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
        // Abre a seção antes de marcar o erro — o efeito de foco depende do
        // campo estar montado para conseguir rolar até ele.
        if (campoExigeModoCompleto(erro.campo)) setModoCompleto(true)
        setErroCampo(erro)
        emitGerenteToast({ kind: 'error', message: erro.mensagem })
        return
      }
      setErroCampo(null)

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
        ...(comoRascunho ? payloadStatusRascunho() : {}),
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
        const createdId = !editando && r.data && 'id' in r.data ? r.data.id : null
        // Estoque inicial só se aplica no create (createdId).
        //
        // Faixa de atacado: agora sincronizada DENTRO da mesma RPC do create
        // (Onda 2 · Bloco 4, `criar_produto_com_estoque_inicial` com `p_faixa`)
        // — mesmo padrão que a EDIÇÃO já usava desde `atualizar_produto_com_faixa_atacado`.
        // Antes havia uma 2ª chamada aqui (`sincronizarFaixaAtacado`), fora da
        // transação do produto; uma falha ali deixava o produto criado sem a
        // faixa correspondente. Se a RPC falhar por causa da faixa (quantidade/
        // preço inválido, ou margem negativa), isso já vem em `r.error` — mesmo
        // caminho de erro do resto do formulário, sem toast separado.

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
            // "liberado no PDV" seria mentira com saldo 0: a RPC de venda
            // aborta com ESTOQUE_INSUFICIENTE. Não existe venda com estoque
            // negativo neste sistema.
            const semEstoque =
              Boolean(createdId) &&
              (!estoqueIntent.deveAplicar || estoqueIntent.quantidade <= 0)
            if (!editando) {
              return semEstoque ? p.criado_publicado_sem_estoque : p.criado_publicado
            }
            if (isRascunho(produto.status_publicacao)) return p.criado_publicado
            return m.comum.sucesso
          })()
          emitGerenteToast({ kind: 'success', message: msg })
        }

        // Persistido: o estado atual vira o baseline limpo ANTES de refresh
        // externo (onSaved → router.refresh) poder alterar opções auxiliares.
        form.commitBaseline()

        const estoqueFalhou = feedbackEstoque.kind === 'produto_ok_estoque_falhou'
        if (opts?.continuar && !editando && !estoqueFalhou) {
          form.limparParaNovoCadastro()
          onSaved()
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
          onSaved()
          return
        }

        onSaved()
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
    /** Publicado mas com saldo 0 — o caixa vai recusar até ajustar o estoque. */
    const estoquePendenteParaVender =
      !posSalvar.rascunho && !posSalvar.estoqueInicialFalhou && posSalvar.estoqueZerado

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
          <Button type="button" variant="primary" onClick={fechar}>
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
        {/* Com saldo 0 o ajuste de estoque NÃO é passo opcional: sem ele o
            caixa recusa a venda. Chamar de "opcional" mandava o operador
            embora achando que o produto já vendia. */}
        {!posSalvar.estoqueInicialFalhou ? (
          <p className="mt-2 text-caption text-jl-fg-3">
            {estoquePendenteParaVender
              ? p.pos_salvar_hint_estoque_obrigatorio
              : p.pos_salvar_hint}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            asChild
            variant={
              posSalvar.estoqueInicialFalhou || estoquePendenteParaVender
                ? 'primary'
                : 'secondary'
            }
            size="sm"
            className="gap-1.5"
          >
            <Link href={estoqueHref} onClick={fechar}>
              <Warehouse size={14} aria-hidden />
              {p.pos_salvar_ajustar_estoque}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="gap-1.5">
            <Link href={etiquetaHref} onClick={fechar}>
              <Printer size={14} aria-hidden />
              {p.pos_salvar_imprimir_etiqueta}
            </Link>
          </Button>
        </div>
      </DragonModal>
    )
  }

  // Create (Missão 1): "Salvar produto". Edit: rótulos de publicação do main.
  const ctaPrincipalLabel = !editando
    ? p.salvar_produto
    : produto && !isRascunho(produto.status_publicacao)
      ? p.editar_modal_salvar
      : p.publicar_no_pdv

  // "removido" só quando a consulta de nomes teve sucesso e o autor não voltou.
  // Se a consulta falhou (`*Indisponivel`), a UI não afirma remoção.
  const linhaCriadoPor =
    editando && autoria
      ? formatAutoriaLine(
          p.autoria_criado_por,
          autoria.criadoPorNome,
          autoria.criadoEm,
          autoria.criadoPorIndisponivel ? p.autoria_indisponivel : p.autoria_desconhecido,
        )
      : null
  const linhaEditadoPor =
    editando && autoria
      ? formatAutoriaLine(
          p.autoria_editado_por,
          autoria.atualizadoPorNome,
          autoria.atualizadoEm,
          autoria.atualizadoPorIndisponivel ? p.autoria_indisponivel : p.autoria_desconhecido,
        )
      : null

  return (
    <>
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
            className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-caption font-semibold ${statusChipClassName(statusChip.tone)}`}
          >
            {statusChip.label}
          </span>
          <span className="text-caption font-normal text-fg-subtle">{statusChip.hint}</span>
          {linhaCriadoPor || linhaEditadoPor ? (
            <span className="flex flex-col text-caption font-normal text-fg-subtle">
              {linhaCriadoPor ? <span>{linhaCriadoPor}</span> : null}
              {linhaEditadoPor ? <span>{linhaEditadoPor}</span> : null}
            </span>
          ) : null}
        </span>
      }
      dismissable={!saving}
      closeLabel={m.comum.cancelar}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={fechar}
            disabled={saving}
          >
            {m.comum.cancelar}
          </Button>
          {!editando ? (
            <Button
              type="button"
              variant="secondary"
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
              disabled={saving}
              onClick={() => void salvar({ rascunho: true })}
            >
              {saving ? '…' : p.salvar_rascunho}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="primary"
            disabled={saving}
            onClick={() => void salvar()}
          >
            {saving ? '…' : ctaPrincipalLabel}
          </Button>
        </>
      }
    >
      <div
        ref={formWrapRef}
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
          erro={erroCampo}
          modoCompleto={modoCompleto}
          onToggleModoCompleto={() => setModoCompleto((v) => !v)}
          onFornecedoresChange={(fornecedores) =>
            setOpcoes((prev) => ({ ...prev, fornecedores }))
          }
          onCategoriasChange={(categorias) =>
            setOpcoes((prev) => ({ ...prev, categorias }))
          }
          onMarcasChange={(marcas) => setOpcoes((prev) => ({ ...prev, marcas }))}
          imagemUrl={imagemUrl}
          onImagemChange={(url) => {
            // Só reflete a foto nova e avisa quem lista. Trocar foto NÃO é salvar:
            // encaminhar isto para `onSaved` fechava o modal e derrubava os campos
            // ainda não gravados (preço, categoria, fiscal…).
            setImagemUrl(url)
            onImagemAtualizada?.()
          }}
          idioma={idioma}
          nomeRef={nomeRef}
          codigoBarrasRef={codigoBarrasRef}
          precoCustoRef={precoCustoRef}
          precoVarejoRef={precoVarejoRef}
          estoqueInicialRef={estoqueInicialRef}
          onEnterSubmit={() => void salvar()}
          onCodigoBarrasBlur={() => void aplicarSugestaoBarcode()}
          sugestaoHint={sugestaoHint}
          {...form}
        />
      </div>
    </DragonModal>

    <DragonModal
      open={confirmDescartarOpen}
      onClose={() => setConfirmDescartarOpen(false)}
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
            onClick={() => setConfirmDescartarOpen(false)}
          >
            {p.confirm_descartar_continuar}
          </Button>
          <Button type="button" variant="danger" onClick={fecharDeVerdade}>
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
