"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CaixaBootstrapInicial } from "@/app/caixa/caixaBootstrapTypes"
import {
  obterMovimentacoesCaixa,
  obterStatusCaixaOperador,
  registrarMovimentacao,
  autorizarMovimentacaoGerente,
  cancelarMovimentacaoCaixa,
  estornarMovimentacaoCaixa,
} from "@/app/caixa/actions"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/caixaMovimentacaoTypes"
import type { ComprovanteMovimentacao } from "@/app/caixa/CaixaMovimentacaoReciboModal"
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint"
import type { Mensagens } from "@/i18n/getMessages"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"
import type { TipoMovimentacaoUi } from "@/app/caixa/caixaMovimentacaoTypes"
import type { AcaoMovimentacaoTipo } from "@/app/caixa/caixaMovimentacaoTypes"
import { useMovimentacoesRealtime } from "@/app/caixa/hooks/useMovimentacoesRealtime"
import type { CaixaToastKind } from "@/app/caixa/hooks/useCaixaMensagens"

export type CaixaStatusUi =
  | {
      status: "ABERTO"
      caixaId: string
      dataAbertura: string
      valorInicial: number
      valorSistemaDinheiro: number
      blindClosureEnabled: boolean
    }
  | { status: "FECHADO" }
  | { status: "ERRO"; error: string }

type AcaoState = {
  tipo: AcaoMovimentacaoTipo
  item: MovimentacaoCaixaDTO
} | null

type Params = {
  m: Mensagens
  setCaixaMensagem: (text: string | null, options?: { kind?: CaixaToastKind }) => void
  movimentacaoModalTipo: TipoMovimentacaoUi | null
  acaoMovimentacao: AcaoState
  currentUserId: string | null
  /**
   * Status do turno (e movimentações, se aberto) já carregados no Server Component.
   * Consumido só na montagem; recargas seguintes seguem pela Server Action.
   */
  inicial?: Pick<CaixaBootstrapInicial, "status" | "movimentacoes"> | null
}

function movimentacoesIniciais(
  inicial: Pick<CaixaBootstrapInicial, "status" | "movimentacoes"> | null | undefined,
): MovimentacaoCaixaDTO[] {
  const res = inicial?.movimentacoes
  return res && res.ok ? res.itens : []
}

function mapStatusToUi(
  status: Awaited<ReturnType<typeof obterStatusCaixaOperador>>,
): CaixaStatusUi | null {
  if (!status.ok) {
    return {
      status: "ERRO",
      error: status.error ?? "Erro desconhecido",
    }
  }
  if (status.status === "FECHADO") return { status: "FECHADO" }
  return {
    status: "ABERTO",
    caixaId: status.caixaId,
    dataAbertura: status.dataAbertura,
    valorInicial: status.valorInicial,
    valorSistemaDinheiro: status.valorSistemaDinheiro,
    blindClosureEnabled: status.blindClosureEnabled,
  }
}

export function isCaixaAberto(
  s: CaixaStatusUi | null,
): s is Extract<CaixaStatusUi, { status: "ABERTO" }> {
  return s?.status === "ABERTO"
}

export function useCaixaStatusMovimentacoes({
  m,
  setCaixaMensagem,
  movimentacaoModalTipo,
  acaoMovimentacao,
  currentUserId,
  inicial,
}: Params) {
  const [caixaStatus, setCaixaStatus] = useState<CaixaStatusUi | null>(() =>
    inicial ? mapStatusToUi(inicial.status) : null,
  )
  const [carregandoStatus, setCarregandoStatus] = useState(!inicial)
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoCaixaDTO[]>(() =>
    movimentacoesIniciais(inicial),
  )
  const statusInicialRef = useRef(inicial ?? null)
  const [carregandoMovimentacoes, setCarregandoMovimentacoes] = useState(false)
  const [movimentandoCaixa, setMovimentandoCaixa] = useState(false)
  const [processandoAcaoMovimentacao, setProcessandoAcaoMovimentacao] = useState(false)
  const [comprovanteMovimentacao, setComprovanteMovimentacao] = useState<ComprovanteMovimentacao | null>(null)

  const recarregarMovimentacoes = useCallback(
    async (caixaId?: string) => {
      if (!caixaId) {
        setMovimentacoes([])
        return
      }
      setCarregandoMovimentacoes(true)
      try {
        const res = await obterMovimentacoesCaixa(caixaId)
        if (!res.ok) {
          setCaixaMensagem(res.error)
          return
        }
        setMovimentacoes(res.itens)
      } finally {
        setCarregandoMovimentacoes(false)
      }
    },
    [setCaixaMensagem],
  )

  const recarregarStatusCaixa = useCallback(async () => {
    setCarregandoStatus(true)
    try {
      const status = await obterStatusCaixaOperador()
      const ui = mapStatusToUi(status)
      setCaixaStatus(ui)
      if (ui?.status === "ERRO") {
        setMovimentacoes([])
        setCaixaMensagem(ui.error)
        return
      }
      if (ui?.status === "ABERTO") {
        await recarregarMovimentacoes(ui.caixaId)
      } else {
        setMovimentacoes([])
      }
    } finally {
      setCarregandoStatus(false)
    }
  }, [recarregarMovimentacoes, setCaixaMensagem])

  useEffect(() => {
    const preCarregado = statusInicialRef.current
    statusInicialRef.current = null
    if (preCarregado) {
      // Mesmas mensagens que `recarregarStatusCaixa` emitiria para esse resultado.
      const ui = mapStatusToUi(preCarregado.status)
      if (ui?.status === "ERRO") setCaixaMensagem(ui.error)
      else if (preCarregado.movimentacoes && !preCarregado.movimentacoes.ok) {
        setCaixaMensagem(preCarregado.movimentacoes.error)
      }
      return
    }
    void recarregarStatusCaixa()
  }, [recarregarStatusCaixa, setCaixaMensagem])

  const handleExternalMovimentacao = useCallback(() => {
    void recarregarStatusCaixa()
    if (isCaixaAberto(caixaStatus)) void recarregarMovimentacoes(caixaStatus.caixaId)
  }, [recarregarStatusCaixa, recarregarMovimentacoes, caixaStatus])

  useMovimentacoesRealtime({
    caixaId: isCaixaAberto(caixaStatus) ? caixaStatus.caixaId : null,
    currentUserId,
    onExternalChange: handleExternalMovimentacao,
  })

  const handleSalvarMovimentacao = useCallback(
    async (payload: {
      valor: number
      motivoCodigo: string
      motivo: string
      gerenteSenha?: string
      idempotencyKey: string
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!isCaixaAberto(caixaStatus)) {
        return { ok: false, error: m.caixa.msg_caixa_fechado_movimentacao }
      }
      if (!movimentacaoModalTipo) {
        return { ok: false, error: m.caixa.msg_tipo_movimentacao_invalido }
      }

      setMovimentandoCaixa(true)
      try {
        const registro = await registrarMovimentacao({
          caixaId: caixaStatus.caixaId,
          tipo: movimentacaoModalTipo,
          formaPagamento: "dinheiro",
          valor: payload.valor,
          motivo: payload.motivo,
          motivoCodigo: payload.motivoCodigo,
          // Chave do modal, estável entre reenvios: é ela que faz o índice
          // `uq_movimentacoes_caixa_idempotency` bloquear a sangria duplicada.
          idempotencyKey: payload.idempotencyKey,
          terminalId: getDeviceFingerprint(),
        })

        if (!registro.ok) return { ok: false, error: registro.error }

        let saldoFinal = registro.saldoAtual

        if (registro.status === "pendente") {
          if (!payload.gerenteSenha?.trim()) {
            setCaixaMensagem(m.caixa.msg_movimentacao_pendente_gerente)
            await recarregarStatusCaixa()
            return { ok: true }
          }
          const aprovacao = await autorizarMovimentacaoGerente(
            registro.movimentacaoId,
            payload.gerenteSenha,
          )
          if (!aprovacao.ok) {
            return {
              ok: false,
              error: caixaFmt(m.caixa.msg_movimentacao_aprovacao_falhou, {
                erro: aprovacao.error,
              }),
            }
          }
          saldoFinal = aprovacao.saldoAtual
        }

        const label = movimentacaoModalTipo === "sangria" ? m.caixa.sangria : m.caixa.suprimento
        // `{ kind: "success" }` explícito: sem isso, `setCaixaMensagem` cai no
        // default genérico "warning" (usado de propósito no caso "pendente"
        // acima, que É um aviso) — o toast de sucesso saía com role="alert"
        // (assertivo) e ícone de alerta, apesar do texto dizer "registrada
        // com sucesso". Comprovado em E2E: `getByRole('status')` nunca casava
        // esse toast porque ele renderizava como `role="alert"`.
        setCaixaMensagem(
          caixaFmt(m.caixa.msg_movimentacao_registrada_ok, {
            tipo: label,
            valor: formatDecimalBRL(payload.valor),
          }),
          { kind: "success" },
        )
        // Comprovante para impressão — saldo antes derivado do saldo final +/- valor,
        // já que a API não retorna o saldo pré-movimentação diretamente.
        const saldoAntes =
          movimentacaoModalTipo === "sangria" ? saldoFinal + payload.valor : saldoFinal - payload.valor
        setComprovanteMovimentacao({
          tipo: movimentacaoModalTipo,
          valor: payload.valor,
          motivo: payload.motivo,
          saldoAntes,
          saldoDepois: saldoFinal,
          data: new Date(),
        })
        await recarregarStatusCaixa()
        await recarregarMovimentacoes(caixaStatus.caixaId)
        return { ok: true }
      } finally {
        setMovimentandoCaixa(false)
      }
    },
    [
      caixaStatus,
      movimentacaoModalTipo,
      recarregarStatusCaixa,
      recarregarMovimentacoes,
      m,
      setCaixaMensagem,
    ],
  )

  const handleConfirmarAcaoMovimentacao = useCallback(
    async (motivo: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!acaoMovimentacao) return { ok: false, error: m.caixa.msg_acao_movimentacao_invalida }
      setProcessandoAcaoMovimentacao(true)
      try {
        if (acaoMovimentacao.tipo === "cancelar") {
          const res = await cancelarMovimentacaoCaixa(acaoMovimentacao.item.id, motivo)
          if (!res.ok) return { ok: false, error: res.error }
          setCaixaMensagem(m.caixa.timeline_msg_cancelada)
        } else {
          const res = await estornarMovimentacaoCaixa(acaoMovimentacao.item.id, motivo)
          if (!res.ok) return { ok: false, error: res.error }
          setCaixaMensagem(m.caixa.timeline_msg_estornada)
        }
        await recarregarStatusCaixa()
        if (isCaixaAberto(caixaStatus)) {
          await recarregarMovimentacoes(caixaStatus.caixaId)
        }
        return { ok: true }
      } finally {
        setProcessandoAcaoMovimentacao(false)
      }
    },
    [
      acaoMovimentacao,
      caixaStatus,
      recarregarMovimentacoes,
      recarregarStatusCaixa,
      m,
      setCaixaMensagem,
    ],
  )

  return {
    caixaStatus,
    carregandoStatus,
    movimentacoes,
    carregandoMovimentacoes,
    movimentandoCaixa,
    processandoAcaoMovimentacao,
    comprovanteMovimentacao,
    limparComprovanteMovimentacao: useCallback(() => setComprovanteMovimentacao(null), []),
    recarregarStatusCaixa,
    handleSalvarMovimentacao,
    handleConfirmarAcaoMovimentacao,
  }
}
