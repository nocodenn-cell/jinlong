'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  atualizarDadosProdutoGerente,
  buscarProdutosComFiltros,
  criarProduto,
} from '@/app/gerente/produtos/actions'
import type { OpcoesFiltrosProdutos } from '@/lib/gerente/produtos/opcoesFiltrosTypes'
import type { ProdutoGerenteRow } from '@/lib/gerente/produtos/produtoGerenteTypes'
import { obterAutoriaProduto } from '@/app/gerente/produtos/produtoAutoriaActions'
import type { ProdutoAutoria } from '@/lib/gerente/produtos/produtoAutoriaTypes'
import type { Mensagens } from '@/i18n/getMessages'
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
import { buildSubmitPayload } from './produtoForm.mappers'
import { primeiroErroEntradasProduto } from './produtoForm.entrada'
import { validarProdutoFormClient, type ProdutoFormErro } from './produtoForm.clientValidation'
import { localizarCampo } from './produtoForm.campoFoco'
import { useProdutoForm } from './useProdutoForm'
import { mergeOpcoesFiltrosPreservandoLocal } from './mergeOpcoesFiltros'
import {
  emitCadastroDuration,
  fetchSugestaoCadastro,
  fontesLabel,
} from '@/lib/gerente/cadastroSugestaoClient'
import { isGtinLookupCandidate, normalizeGtinDigits } from '@/core/catalog/sugestaoCadastro'
import { combinarSugestaoHint } from './sugestaoHint'

export type PosSalvarState = Readonly<{
  produtoId: string
  rascunho: boolean
  codigoBarras: string
  /** Qty pedida era 0 (ou vazia) — aviso preventivo. */
  estoqueZerado: boolean
  /** Pediu estoque inicial e a RPC falhou. */
  estoqueInicialFalhou: boolean
  estoqueErroDetalhe: string | null
}>

export type ProdutoFormOrchestrationProps = Readonly<{
  open: boolean
  produto: ProdutoGerenteRow | null
  /** Duplicar para criar: semeia um NOVO cadastro a partir deste produto. */
  duplicarDe?: ProdutoGerenteRow | null
  codigoBarrasInicial?: string | null
  opcoesIniciais: OpcoesFiltrosProdutos
  m: Mensagens
  onSaved: () => void
  onImagemAtualizada?: () => void
  /** Fecha o container (modal fecha; página navega para trás) — decisão do consumidor. */
  onOpenChange: (open: boolean) => void
}>

/**
 * EXCEÇÃO SSoT (entity-ssot.mdc): estoque inicial só no create — via RPC
 * `criar_produto_com_estoque_inicial` (mesma TX). Pós-criação → `/admin/estoque`.
 *
 * Orquestração do cadastro/edição de produto — extraída de `ProdutoFormModal`
 * (Etapa 1 da reforma Rápido/Completo) para ser consumida tanto pelo modal
 * (Cadastro Rápido) quanto pela página (Cadastro Completo), sem duplicar
 * validar/salvar/focar-erro/sugestão GTIN/dirty-check em dois lugares.
 *
 * Não decide NADA de apresentação: refs de DOM para a cadeia de Enter do
 * scanner, cadeia de teclado (Ctrl+Enter) e o foco inicial ao abrir
 * continuam do lado do container — são UX específica do Cadastro Rápido,
 * não orquestração de domínio.
 */
export function useProdutoFormOrchestration({
  open,
  produto,
  duplicarDe = null,
  codigoBarrasInicial = null,
  opcoesIniciais,
  m,
  onSaved,
  onImagemAtualizada,
  onOpenChange,
}: ProdutoFormOrchestrationProps) {
  const p = m.produtos
  const editando = produto !== null
  const podeSalvarRascunho = podeSalvarComoRascunho(editando, produto?.status_publicacao)

  const [erroCampo, setErroCampo] = useState<ProdutoFormErro | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDescartarOpen, setConfirmDescartarOpen] = useState(false)
  const [autoria, setAutoria] = useState<ProdutoAutoria | null>(null)
  const [opcoes, setOpcoes] = useState(opcoesIniciais)
  const [posSalvar, setPosSalvar] = useState<PosSalvarState | null>(null)
  const [imagemUrl, setImagemUrl] = useState<string | null>(produto?.imagem_url ?? null)
  const [sugestaoHint, setSugestaoHint] = useState<string | null>(null)
  const [knownSuggestion, setKnownSuggestion] = useState(false)
  const [fonteSugestao, setFonteSugestao] = useState<string | null>(null)
  /**
   * Incrementa a cada "Salvar e continuar" bem-sucedido — sinal para o
   * container refocar o campo de entrada rápida (código de barras), já que
   * o hook não é dono de refs de DOM. Sem isto, o efeito de foco inicial do
   * container (que depende de `open`/`posSalvar`) não tem como saber que um
   * novo ciclo de cadastro começou sem fechar/reabrir o formulário.
   */
  const [continuarTick, setContinuarTick] = useState(0)
  const openedAtRef = useRef(0)
  const lastLookupGtinRef = useRef('')
  /** Detecta abertura real (false→true) para resetar opções às props. */
  const estavaAbertoRef = useRef(false)
  /** Escopo do foco em campo reprovado — o container ancora seu wrapper aqui. */
  const formWrapRef = useRef<HTMLDivElement>(null)

  const form = useProdutoForm(open, produto, duplicarDe, { codigoBarrasInicial })
  /**
   * `form` é um objeto novo a cada render. A sugestão de GTIN é assíncrona
   * (rede) — sem este ref, o guard "só preenche se o campo está vazio" reavalia
   * o `form.nome` fechado no momento do blur, não o valor atual: se o operador
   * digitar o nome enquanto a busca ainda está em voo, a resposta chega depois
   * e sobrescreve o texto já digitado, porque o closure antigo ainda vê nome vazio.
   */
  const formRef = useRef(form)
  formRef.current = form

  /**
   * Reinicializa o estado derivado só quando o formulário abre de verdade
   * (ou troca o produto em edição). NÃO depende de `opcoesIniciais`: um
   * `router.refresh()` pós-save muda as opções e, se limpar `posSalvar` aqui,
   * o operador volta à tela de edição dirty e vê "Descartar alterações?".
   */
  useEffect(() => {
    if (!open) return
    setPosSalvar(null)
    setErroCampo(null)
    setImagemUrl(produto?.imagem_url ?? null)
    setSugestaoHint(null)
    setKnownSuggestion(false)
    setFonteSugestao(null)
    lastLookupGtinRef.current = ''
    openedAtRef.current = Date.now()
  }, [open, produto?.id, produto?.imagem_url])

  /**
   * Opções auxiliares: na abertura real, espelha as props.
   * Enquanto o formulário permanece aberto, merge por id — refresh RSC/cache
   * stale não pode apagar categoria/marca/fornecedor criados localmente.
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

  /** Nomes de produtos parecidos, para o aviso (não bloqueante) de duplicidade do cadastro. */
  const buscarNomesSimilares = useCallback(async (nome: string) => {
    const r = await buscarProdutosComFiltros({ busca: nome, pageSize: 20 })
    return r.success ? r.data.rows.map((row) => ({ id: row.id, nome: row.nome })) : null
  }, [])

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
      // Reavalia contra o valor MAIS RECENTE dos campos (não o `form` fechado
      // no início desta função) — a busca é assíncrona e o operador pode ter
      // digitado enquanto ela estava em voo.
      const atual = formRef.current
      if (!atual.nome.trim() && s.nome) atual.setNome(s.nome)
      if (atual.precoVarejoInput.parse() == null && s.precoVarejo != null) {
        atual.precoVarejoInput.reset(s.precoVarejo)
      }
      if (!atual.categoriaId && s.categoriaId) atual.setCategoriaId(s.categoriaId)
      if (!atual.ncm.trim() && s.ncm) atual.setNcm(s.ncm)
      if (atual.precoCustoInput.parse() == null && s.precoCusto != null) {
        atual.precoCustoInput.reset(s.precoCusto)
      }
      const baseHint = s.fontes[0] === 'nenhuma' ? null : p.sugestao_aplicada.replace('{{fonte}}', fonte)
      setSugestaoHint(combinarSugestaoHint(baseHint, s.marca, p.sugestao_marca_detectada))
    },
    [
      editando,
      form,
      p.sugestao_buscando,
      p.sugestao_aplicada,
      p.sugestao_marca_detectada,
      p.err_codigo_barras_duplicado,
    ],
  )

  useEffect(() => {
    if (!open || editando || posSalvar) return
    const inicial = (codigoBarrasInicial ?? '').trim()
    if (!inicial || !isGtinLookupCandidate(normalizeGtinDigits(inicial))) return
    void aplicarSugestaoBarcode(inicial)
  }, [open, editando, posSalvar, codigoBarrasInicial, aplicarSugestaoBarcode])

  /**
   * Leva o operador até o campo reprovado. Roda como efeito (não no handler)
   * porque o campo pode estar fora da viewport — o `data-field` só existe
   * depois do commit, e é aqui que ele já existe no DOM.
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
   * pede confirmação antes de descartar. Após save bem-sucedido,
   * `commitBaseline()` deixa isDirty=false; a tela pós-salvar (`posSalvar`)
   * também bypassa o guard.
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

      // Entrada inválida (letras, "10.50", negativos) bloqueia o salvar com o
      // motivo no campo, em vez de virar outro valor.
      const erroEntrada = primeiroErroEntradasProduto(
        {
          precoVarejo: form.precoVarejoInput.validar(),
          precoAtacado: form.precoAtacadoInput.validar(),
          precoCusto: form.precoCustoInput.validar(),
          estoqueInicial: form.estoqueInicialQty,
          estoqueMinimo: form.estoqueInicialMin,
          quantidadeGatilho: form.quantidadeGatilho,
        },
        p,
      )
      if (erroEntrada) {
        setErroCampo(erroEntrada)
        emitGerenteToast({ kind: 'error', message: erroEntrada.mensagem })
        return
      }

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
        typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : null

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
          icmsOrigem: form.icmsOrigem,
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
        // Faixa de atacado: sincronizada DENTRO da mesma RPC do create
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
            message: detalhe ? `${p.erro_estoque_inicial} (${detalhe})` : p.erro_estoque_inicial,
          })
        } else {
          const msg = (() => {
            if (comoRascunho) return p.criado_rascunho
            // "liberado no PDV" seria mentira com saldo 0: a RPC de venda
            // aborta com ESTOQUE_INSUFICIENTE. Não existe venda com estoque
            // negativo neste sistema.
            const semEstoque =
              Boolean(createdId) && (!estoqueIntent.deveAplicar || estoqueIntent.quantidade <= 0)
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
          setContinuarTick((n) => n + 1)
          onSaved()
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

  return {
    form,
    editando,
    podeSalvarRascunho,
    erroCampo,
    saving,
    confirmDescartarOpen,
    setConfirmDescartarOpen,
    autoria,
    opcoes,
    continuarTick,
    onFornecedoresChange: (fornecedores: OpcoesFiltrosProdutos['fornecedores']) =>
      setOpcoes((prev) => ({ ...prev, fornecedores })),
    onCategoriasChange: (categorias: OpcoesFiltrosProdutos['categorias']) =>
      setOpcoes((prev) => ({ ...prev, categorias })),
    onMarcasChange: (marcas: OpcoesFiltrosProdutos['marcas']) =>
      setOpcoes((prev) => ({ ...prev, marcas })),
    posSalvar,
    imagemUrl,
    onImagemChange: (url: string | null) => {
      // Só reflete a foto nova e avisa quem lista. Trocar foto NÃO é salvar:
      // encaminhar isto para `onSaved` fechava o container e derrubava os
      // campos ainda não gravados (preço, categoria, fiscal…).
      setImagemUrl(url)
      onImagemAtualizada?.()
    },
    sugestaoHint,
    formWrapRef,
    salvar,
    fechar,
    fecharDeVerdade,
    aplicarSugestaoBarcode,
    buscarNomesSimilares,
  }
}

export type UseProdutoFormOrchestrationReturn = ReturnType<typeof useProdutoFormOrchestration>
