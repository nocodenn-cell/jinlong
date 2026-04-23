"use client"

import { useCallback, useEffect, useState } from "react"
import {
  obterMovimentacoesCaixa,
  obterStatusCaixaOperador,
  registrarMovimentacao,
  autorizarMovimentacaoGerente,
  cancelarMovimentacaoCaixa,
  estornarMovimentacaoCaixa,
} from "@/app/caixa/actions"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/caixaMovimentacaoTypes"
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint"
import type { Mensagens } from "@/i18n/getMessages"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import type { TipoMovimentacaoUi } from "@/app/caixa/caixaMovimentacaoTypes"
import type { AcaoMovimentacaoTipo } from "@/app/caixa/caixaMovimentacaoTypes"

type CaixaStatusState =
  | {
      aberto: true
      caixaId: string
      dataAbertura: string
      valorInicial: number
      valorSistemaDinheiro: number
      blindClosureEnabled: boolean
    }
  | { aberto: false }
  | null

type AcaoState = {
  tipo: AcaoMovimentacaoTipo
  item: MovimentacaoCaixaDTO
} | null

type Params = {
  m: Mensagens
  setCaixaMensagem: (text: string | null) => void
  movimentacaoModalTipo: TipoMovimentacaoUi | null
  acaoMovimentacao: AcaoState
}

export function useCaixaStatusMovimentacoes({
  m,
  setCaixaMensagem,
  movimentacaoModalTipo,
  acaoMovimentacao,
}: Params) {
  const [caixaStatus, setCaixaStatus] = useState<CaixaStatusState>(null)
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoCaixaDTO[]>([])
  const [carregandoMovimentacoes, setCarregandoMovimentacoes] = useState(false)
  const [movimentandoCaixa, setMovimentandoCaixa] = useState(false)
  const [processandoAcaoMovimentacao, setProcessandoAcaoMovimentacao] = useState(false)

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
    const status = await obterStatusCaixaOperador()
    if (!status.ok) {
      setCaixaStatus(null)
      setMovimentacoes([])
      setCaixaMensagem(status.error)
      return
    }
    if (status.aberto) {
      setCaixaStatus({
        aberto: true,
        caixaId: status.caixaId,
        dataAbertura: status.dataAbertura,
        valorInicial: status.valorInicial,
        valorSistemaDinheiro: status.valorSistemaDinheiro,
        blindClosureEnabled: status.blindClosureEnabled,
      })
      await recarregarMovimentacoes(status.caixaId)
    } else {
      setCaixaStatus({ aberto: false })
      setMovimentacoes([])
    }
  }, [recarregarMovimentacoes, setCaixaMensagem])

  useEffect(() => {
    void recarregarStatusCaixa()
  }, [recarregarStatusCaixa])

  const handleSalvarMovimentacao = useCallback(
    async (payload: {
      valor: number
      motivoCodigo: string
      motivo: string
      gerenteSenha?: string
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!caixaStatus?.aberto) {
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
          idempotencyKey: crypto.randomUUID(),
          terminalId: getDeviceFingerprint(),
        })

        if (!registro.ok) return { ok: false, error: registro.error }

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
        }

        const label = movimentacaoModalTipo === "sangria" ? m.caixa.sangria : m.caixa.suprimento
        setCaixaMensagem(
          caixaFmt(m.caixa.msg_movimentacao_registrada_ok, {
            tipo: label,
            valor: payload.valor.toFixed(2),
          }),
        )
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
        if (caixaStatus?.aberto) {
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
    movimentacoes,
    carregandoMovimentacoes,
    movimentandoCaixa,
    processandoAcaoMovimentacao,
    recarregarStatusCaixa,
    handleSalvarMovimentacao,
    handleConfirmarAcaoMovimentacao,
  }
}
