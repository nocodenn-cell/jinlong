"use client"

import { useCallback, useEffect, useState } from "react"
import {
  colocarVendaEmEsperaCaixa,
  descartarVendaEmEsperaCaixa,
  listarVendasEmEsperaCaixa,
  obterClienteCaixa,
  retomarVendaEmEsperaCaixa,
  type VendaEmEsperaCard,
} from "@/app/caixa/actions"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { isCaixaAberto } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import type { CaixaStatusUi } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import type { ReprecificarQuantidadeInput } from "@/app/caixa/hooks/useReprecificarQuantidadeCaixa"
import type { Mensagens } from "@/i18n/getMessages"
import type { ItemCarrinhoComPreco } from "@/stores/carrinhoStore"

type SetCaixaMensagem = (
  texto: string,
  opts?: { kind?: "success" | "error" | "warning" | "info" },
) => void

export type UseCaixaVendasEmEsperaDeps = Readonly<{
  m: Mensagens
  itens: ItemCarrinhoComPreco[]
  totalBruto: number
  totalDesconto: number
  totalLiquidoComGerente: number
  descontoGerentePercentual: number
  caixaStatus: CaixaStatusUi | null
  clienteId: string | null
  /** Recarrega a lista quando o turno muda (abrir/fechar caixa). */
  turnoRefreshToken: number
  novoCupom: () => void
  limparEstadoDescontoGerente: () => void
  substituirCarrinho: (itens: ItemCarrinhoComPreco[]) => void
  reprecificar: (args: ReprecificarQuantidadeInput) => void
  setCaixaMensagem: SetCaixaMensagem
  tocarFeedback: (kind: "ok" | "erro") => void
  focarCampoBusca: () => void
  setClienteId: (id: string | null) => void
  setClienteNome: (nome: string | null) => void
}>

/**
 * Vendas em espera do caixa — listar, colocar em espera, retomar e descartar.
 *
 * Extraído de `CaixaPageClient` sem mudança de comportamento: mesma ordem de
 * chamadas, mesmas mensagens e mesmos efeitos. O bloco era coeso (um estado,
 * quatro operações sobre ele) e só estava no componente por acúmulo.
 */
export function useCaixaVendasEmEspera(deps: UseCaixaVendasEmEsperaDeps) {
  const {
    m,
    itens,
    totalBruto,
    totalDesconto,
    totalLiquidoComGerente,
    descontoGerentePercentual,
    caixaStatus,
    clienteId,
    turnoRefreshToken,
    novoCupom,
    limparEstadoDescontoGerente,
    substituirCarrinho,
    reprecificar,
    setCaixaMensagem,
    tocarFeedback,
    focarCampoBusca,
    setClienteId,
    setClienteNome,
  } = deps

  const [vendasEmEspera, setVendasEmEspera] = useState<VendaEmEsperaCard[]>([])
  const [carregandoEmEspera, setCarregandoEmEspera] = useState(false)

  const recarregarEmEspera = useCallback(async () => {
    setCarregandoEmEspera(true)
    try {
      const res = await listarVendasEmEsperaCaixa()
      if (res.ok) setVendasEmEspera(res.vendas)
    } finally {
      setCarregandoEmEspera(false)
    }
  }, [])

  useEffect(() => {
    void recarregarEmEspera()
  }, [recarregarEmEspera, turnoRefreshToken])

  /** Snapshot do cupom atual para `vendas_em_espera` (mesmo payload de antes). */
  const snapshotCupomAtual = useCallback(
    () => ({
      itens,
      totalBruto,
      totalDesconto,
      totalLiquido: totalLiquidoComGerente,
      caixaId: isCaixaAberto(caixaStatus) ? caixaStatus.caixaId : null,
      descontoGerentePercentual:
        descontoGerentePercentual > 0 ? descontoGerentePercentual : null,
      clienteId: clienteId ?? undefined,
    }),
    [
      itens,
      totalBruto,
      totalDesconto,
      totalLiquidoComGerente,
      caixaStatus,
      descontoGerentePercentual,
      clienteId,
    ],
  )

  /** Nova Venda (+): se há itens, coloca em espera; senão limpa cupom. */
  const handleNovaVendaOuEspera = useCallback(async () => {
    if (itens.length === 0) {
      novoCupom()
      return
    }
    const res = await colocarVendaEmEsperaCaixa(snapshotCupomAtual())
    if (!res.ok) {
      setCaixaMensagem(res.error, { kind: "error" })
      tocarFeedback("erro")
      return
    }
    setCaixaMensagem(
      caixaFmt(m.caixa.em_aberto_colocada, { n: String(res.numeroLocal) }),
      { kind: "success" },
    )
    tocarFeedback("ok")
    novoCupom()
    await recarregarEmEspera()
  }, [
    itens.length,
    snapshotCupomAtual,
    novoCupom,
    m.caixa.em_aberto_colocada,
    recarregarEmEspera,
    setCaixaMensagem,
    tocarFeedback,
  ])

  const handleRetomarEmEspera = useCallback(
    async (id: string) => {
      if (itens.length > 0) {
        setCaixaMensagem(m.caixa.em_aberto_finalize_antes, { kind: "warning" })
        const parked = await colocarVendaEmEsperaCaixa(snapshotCupomAtual())
        if (!parked.ok) {
          setCaixaMensagem(parked.error, { kind: "error" })
          tocarFeedback("erro")
          return
        }
        novoCupom()
      }
      const res = await retomarVendaEmEsperaCaixa(id)
      if (!res.ok) {
        setCaixaMensagem(res.error, { kind: "error" })
        tocarFeedback("erro")
        return
      }
      // Token de gerente não é restaurado: exige nova autorização se precisar desconto.
      limparEstadoDescontoGerente()
      substituirCarrinho(res.itens)
      // Restaura o cliente vinculado. `vendas_em_espera` guarda só o id, então o
      // nome do chip é resolvido depois — sem bloquear a retomada do cupom.
      setClienteId(res.clienteId)
      setClienteNome(null)
      if (res.clienteId) {
        void obterClienteCaixa(res.clienteId).then((r) => {
          if (r.ok && r.cliente) setClienteNome(r.cliente.nome)
        })
      }
      // Recalcula VAREJO/ATACADO com a quantidade retomada (spec Fase 2).
      for (const item of res.itens) {
        const tipo = item.resultado?.tipoPreco ?? "VAREJO"
        reprecificar({
          itemId: item.id,
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          tipoPrecoAtual: tipo,
        })
      }
      setCaixaMensagem(
        caixaFmt(m.caixa.em_aberto_retomada, { n: String(res.numeroLocal) }),
        { kind: "success" },
      )
      tocarFeedback("ok")
      await recarregarEmEspera()
      focarCampoBusca()
    },
    [
      itens.length,
      snapshotCupomAtual,
      novoCupom,
      limparEstadoDescontoGerente,
      substituirCarrinho,
      reprecificar,
      m.caixa.em_aberto_retomada,
      m.caixa.em_aberto_finalize_antes,
      recarregarEmEspera,
      setCaixaMensagem,
      tocarFeedback,
      focarCampoBusca,
      setClienteId,
      setClienteNome,
    ],
  )

  const handleDescartarEmEspera = useCallback(
    async (id: string) => {
      const res = await descartarVendaEmEsperaCaixa(id)
      if (!res.ok) {
        setCaixaMensagem(res.error, { kind: "error" })
        return
      }
      await recarregarEmEspera()
    },
    [recarregarEmEspera, setCaixaMensagem],
  )

  return {
    vendasEmEspera,
    carregandoEmEspera,
    recarregarEmEspera,
    handleNovaVendaOuEspera,
    handleRetomarEmEspera,
    handleDescartarEmEspera,
  }
}
