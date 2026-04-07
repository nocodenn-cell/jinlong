"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useCarrinhoStore } from "@/stores/carrinhoStore"
import {
  carregarRegrasPrecoCaixa,
  buscarProdutoParaCaixa,
  finalizarVendaCaixa,
  validarGerenteDesconto,
} from "@/app/caixa/actions"
import type { FinalizarVendaInput } from "@/app/caixa/finalizarVendaValidation"
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint"
import type { Mensagens } from "@/src/lib/i18n/getMessages"
import type { Idioma } from "@/src/lib/idioma/normalizeIdioma"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { CaixaHeader } from "@/app/caixa/CaixaHeader"
import { CaixaSearchBar } from "@/app/caixa/CaixaSearchBar"
import { CaixaCartList } from "@/app/caixa/CaixaCartList"
import { CaixaFooter } from "@/app/caixa/CaixaFooter"
import {
  CaixaGerenteModal,
  type ValidarSenhaGerenteResult,
} from "@/app/caixa/CaixaGerenteModal"

function localeFromIdioma(idioma: Idioma): string {
  if (idioma === "pt") return "pt-BR"
  if (idioma === "zh-HK") return "zh-HK"
  return "zh-CN"
}

type Props = {
  messages: Mensagens
  idioma: Idioma
}

export function CaixaPageClient({ messages: m, idioma }: Props) {
  const [codigo, setCodigo] = useState("")
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [carregandoRegras, setCarregandoRegras] = useState(true)
  const [buscando, setBuscando] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [validandoGerente, setValidandoGerente] = useState(false)
  const [gerenteModalAberto, setGerenteModalAberto] = useState(false)
  const [gerenteValidadoAte, setGerenteValidadoAte] = useState<string | null>(null)
  const [gerenteToken, setGerenteToken] = useState<string | null>(null)
  const [maxDescontoGerentePercentual, setMaxDescontoGerentePercentual] =
    useState<number>(0)
  const [descontoGerentePercentual, setDescontoGerentePercentual] =
    useState<number>(0)
  const [formaPagamento, setFormaPagamento] =
    useState<FinalizarVendaInput["formaPagamento"]>("DINHEIRO")

  const {
    itens,
    totalBruto,
    totalDesconto,
    totalLiquido,
    totalItens,
    totalUnidades,
    setRegras,
    adicionarItem,
    alterarQuantidade,
    removerItem,
    limparCarrinho,
  } = useCarrinhoStore()

  const loc = localeFromIdioma(idioma)

  const limparEstadoDescontoGerente = useCallback(() => {
    setGerenteValidadoAte(null)
    setGerenteToken(null)
    setMaxDescontoGerentePercentual(0)
    setDescontoGerentePercentual(0)
  }, [])

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setCarregandoRegras(true)
      const res = await carregarRegrasPrecoCaixa()
      if (cancelado) return
      if (res.ok) {
        setRegras(res.regras)
        setMensagem(null)
      } else {
        setMensagem(`${m.caixa.regras_erro_prefixo} ${res.error}`)
        setRegras([])
      }
      setCarregandoRegras(false)
    })()
    return () => {
      cancelado = true
    }
  }, [setRegras, m.caixa.regras_erro_prefixo])

  const handleAdicionar = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const trimmed = codigo.trim()
      if (!trimmed) return

      setBuscando(true)
      setMensagem(null)

      try {
        const res = await buscarProdutoParaCaixa(trimmed)

        if (!res.ok) {
          setMensagem(res.error)
          setBuscando(false)
          return
        }

        if (res.status === "nao_encontrado") {
          setMensagem(m.caixa.produto_nao_encontrado)
          setBuscando(false)
          return
        }

        if (res.status === "ambiguo") {
          setMensagem(res.mensagem)
          setBuscando(false)
          return
        }

        const p = res.produto
        const avisoEstoque =
          p.quantidade_estoque !== null && p.quantidade_estoque < 1
            ? m.caixa.estoque_baixo
            : ""

        adicionarItem({
          id: `${p.id}-${Date.now()}`,
          produtoId: p.id,
          nome: p.nome,
          quantidade: 1,
          precoVariejo: p.preco_varejo,
          categoriaId: p.categoria_id ?? undefined,
        })

        setCodigo("")
        if (avisoEstoque) {
          setMensagem(`${m.caixa.item_adicionado} ${avisoEstoque}`)
        } else {
          setMensagem(null)
        }
      } catch {
        setMensagem(m.caixa.falha_busca)
      } finally {
        setBuscando(false)
      }
    },
    [codigo, adicionarItem, m],
  )

  const handleAlterarQuantidade = useCallback(
    (itemId: string, quantidade: number) => {
      if (Number.isNaN(quantidade)) return
      alterarQuantidade(itemId, quantidade)
    },
    [alterarQuantidade],
  )

  const handleRemover = useCallback(
    (itemId: string) => {
      removerItem(itemId)
    },
    [removerItem],
  )

  const handleNovoCupom = useCallback(() => {
    limparCarrinho()
    setCodigo("")
    setMensagem(null)
    limparEstadoDescontoGerente()
  }, [limparCarrinho, limparEstadoDescontoGerente])

  useEffect(() => {
    if (!gerenteValidadoAte) return

    const expiraEmMs = Date.parse(gerenteValidadoAte)
    if (!Number.isFinite(expiraEmMs)) {
      limparEstadoDescontoGerente()
      return
    }

    const checkExpiracao = () => {
      if (Date.now() >= expiraEmMs) {
        limparEstadoDescontoGerente()
        setMensagem(m.caixa.msg_token_expirado)
      }
    }

    checkExpiracao()
    const timer = window.setInterval(checkExpiracao, 1000)
    return () => window.clearInterval(timer)
  }, [gerenteValidadoAte, limparEstadoDescontoGerente, m.caixa.msg_token_expirado])

  const handleFinalizar = useCallback(async () => {
    if (itens.length === 0 || finalizando) return
    if (gerenteValidadoAte && Date.now() >= Date.parse(gerenteValidadoAte)) {
      limparEstadoDescontoGerente()
      setMensagem(m.caixa.msg_token_expirado)
      return
    }
    setFinalizando(true)
    setMensagem(null)
    try {
      const payload: FinalizarVendaInput = {
        formaPagamento,
        totalBruto,
        totalDesconto:
          descontoGerentePercentual > 0
            ? Math.round(
                (totalDesconto +
                  (totalLiquido * descontoGerentePercentual) / 100) *
                  100,
              ) / 100
            : totalDesconto,
        totalLiquido:
          descontoGerentePercentual > 0
            ? Math.round(
                (totalLiquido -
                  (totalLiquido * descontoGerentePercentual) / 100) *
                  100,
              ) / 100
            : totalLiquido,
        descontoGerenteToken:
          descontoGerentePercentual > 0 ? gerenteToken ?? undefined : undefined,
        descontoGerentePercentual:
          descontoGerentePercentual > 0 ? descontoGerentePercentual : undefined,
        itens: itens.map((i) => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
        })),
      }
      const res = await finalizarVendaCaixa(payload)
      if (res.ok) {
        limparCarrinho()
        limparEstadoDescontoGerente()
        setMensagem(
          caixaFmt(m.caixa.msg_venda_ok, { id: res.vendaId.slice(0, 8) }),
        )
      } else {
        setMensagem(res.error)
      }
    } catch {
      setMensagem(m.caixa.msg_falha_finalizar)
    } finally {
      setFinalizando(false)
    }
  }, [
    descontoGerentePercentual,
    finalizando,
    formaPagamento,
    gerenteValidadoAte,
    gerenteToken,
    itens,
    limparEstadoDescontoGerente,
    limparCarrinho,
    totalBruto,
    totalDesconto,
    totalLiquido,
    m,
  ])

  const valorDescontoGerente =
    descontoGerentePercentual > 0
      ? Math.round(((totalLiquido * descontoGerentePercentual) / 100) * 100) /
        100
      : 0
  const totalLiquidoComGerente =
    Math.round((totalLiquido - valorDescontoGerente) * 100) / 100

  const handleValidateSenhaGerente = useCallback(
    async (senha: string): Promise<ValidarSenhaGerenteResult> => {
      setValidandoGerente(true)
      try {
        const res = await validarGerenteDesconto({
          senha,
          deviceFingerprint: getDeviceFingerprint(),
        })
        if (!res.ok) {
          const lock =
            res.lockUntil != null
              ? caixaFmt(m.caixa.msg_lock_ate, {
                  data: new Date(res.lockUntil).toLocaleString(loc),
                })
              : ""
          return {
            ok: false,
            error: caixaFmt(m.caixa.msg_validacao_falha, {
              erro: res.error,
              lock,
            }),
          }
        }
        return {
          ok: true,
          token: res.token,
          expiraEm: res.expiraEm,
          maxDescontoPercentual: res.maxDescontoPercentual,
        }
      } catch {
        return { ok: false, error: m.caixa.msg_falha_gerente_rede }
      } finally {
        setValidandoGerente(false)
      }
    },
    [m, loc],
  )

  const handleAplicarDescontoGerente = useCallback(
    (payload: {
      token: string
      expiraEm: string
      maxDescontoPercentual: number
      percentual: number
    }) => {
      setGerenteValidadoAte(payload.expiraEm)
      setGerenteToken(payload.token)
      setMaxDescontoGerentePercentual(payload.maxDescontoPercentual)
      setDescontoGerentePercentual(payload.percentual)
      setMensagem(
        caixaFmt(m.caixa.msg_gerente_ok, {
          pct: payload.percentual.toFixed(2),
          hora: new Date(payload.expiraEm).toLocaleTimeString(loc),
        }),
      )
    },
    [m, loc],
  )

  return (
    <>
      <div className="min-h-[100dvh] bg-slate-900 text-slate-50 flex flex-col">
        <CaixaHeader m={m} idioma={idioma} carregandoRegras={carregandoRegras} />
        <div className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 px-4 sm:px-6 pt-4 pb-2 space-y-2">
            <CaixaSearchBar
              m={m}
              codigo={codigo}
              onCodigoChange={setCodigo}
              onSubmit={handleAdicionar}
              onNovoCupom={handleNovoCupom}
              buscando={buscando}
              carregandoRegras={carregandoRegras}
            />
            {mensagem && (
              <div className="text-xs text-amber-300">{mensagem}</div>
            )}
          </div>
          <section className="flex-1 min-h-0 flex flex-col mx-4 sm:mx-6 rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden mb-2">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <CaixaCartList
                m={m}
                idioma={idioma}
                itens={itens}
                moeda={m.caixa.moeda_prefixo}
                onAlterarQuantidade={handleAlterarQuantidade}
                onRemover={handleRemover}
              />
            </div>
          </section>
          <CaixaFooter
            m={m}
            idioma={idioma}
            formaPagamento={formaPagamento}
            onFormaPagamentoChange={setFormaPagamento}
            onValidarGerente={() => setGerenteModalAberto(true)}
            onFinalizar={() => void handleFinalizar()}
            validandoGerente={validandoGerente}
            finalizando={finalizando}
            itensLength={itens.length}
            buscando={buscando}
            carregandoRegras={carregandoRegras}
            totalItens={totalItens}
            totalUnidades={totalUnidades}
            gerenteValidadoAte={gerenteValidadoAte}
            descontoGerentePercentual={descontoGerentePercentual}
            maxDescontoGerentePercentual={maxDescontoGerentePercentual}
            totalBruto={totalBruto}
            totalDesconto={totalDesconto}
            valorDescontoGerente={valorDescontoGerente}
            totalLiquidoComGerente={totalLiquidoComGerente}
            moedaPrefixo={m.caixa.moeda_prefixo}
          />
        </div>
      </div>
      <CaixaGerenteModal
        open={gerenteModalAberto}
        onOpenChange={setGerenteModalAberto}
        m={m}
        validando={validandoGerente}
        onValidateSenha={handleValidateSenhaGerente}
        onApply={handleAplicarDescontoGerente}
      />
    </>
  )
}
