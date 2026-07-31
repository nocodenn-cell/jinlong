/** @vitest-environment jsdom */
/**
 * Regressão do P1 de sangria/suprimento duplicado (certificação operacional).
 *
 * O banco já protege via índice único `uq_movimentacoes_caixa_idempotency
 * (caixa_id, idempotency_key)` e o RPC `registrar_movimentacao` devolve a
 * movimentação existente ao capturar `unique_violation`. Essa proteção só
 * funciona se a chave for ESTÁVEL entre reenvios: antes desta correção o hook
 * gerava `crypto.randomUUID()` a cada clique em Salvar, então uma sangria de
 * R$ 500 cuja resposta se perdeu virava duas ao operador tentar de novo —
 * gaveta com R$ 500 a menos que o sistema no fechamento.
 */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CaixaMovimentacaoModal } from "@/app/caixa/CaixaMovimentacaoModal"
import type { Mensagens } from "@/i18n/getMessages"

const mockMensagens = {
  comum: { cancelar: "Cancelar", confirmar: "Confirmar" },
  caixa: {
    modal_sangria_titulo: "Sangria",
    modal_suprimento_titulo: "Suprimento",
    modal_movimentacao_valor: "Valor",
    modal_movimentacao_motivo: "Motivo",
    modal_movimentacao_saldo_estimado: "Saldo {{saldo}}",
    modal_movimentacao_motivo_outro: "Descreva",
    movimentacao_valor_invalido: "Valor inválido",
    movimentacao_saldo_insuficiente: "Saldo insuficiente ({{saldo}})",
    movimentacao_motivo_invalido: "Motivo inválido",
    movimentacao_processando: "Processando…",
    msg_senha_obrigatoria: "Senha obrigatória",
    motivo_troco_inicial: "Troco inicial",
    motivo_pagamento_fornecedor: "Pagamento fornecedor",
    motivo_retirada_deposito: "Retirada depósito",
    motivo_outro: "Outro",
    moeda_prefixo: "R$",
    modal_movimentacao_senha_gerente: "Senha do gerente",
  },
} as unknown as Mensagens

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

type Payload = { valor: number; idempotencyKey: string }

function renderModal(
  open: boolean,
  onSubmit: (p: Payload) => Promise<{ ok: true } | { ok: false; error: string }>,
) {
  act(() => {
    root.render(
      <CaixaMovimentacaoModal
        open={open}
        tipo="sangria"
        saldoEstimado={1000}
        limiteSangriaSemGerente={5000}
        processando={false}
        m={mockMensagens}
        onOpenChange={() => {}}
        onSubmit={onSubmit as never}
      />,
    )
  })
}

/** Preenche o valor e aciona Salvar, como o operador faria. */
async function submeter(valor: string) {
  const input = container.querySelector("input") as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement.prototype,
    "value",
  )!.set!
  await act(async () => {
    setter.call(input, valor)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })

  const salvar = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Confirmar",
  ) as HTMLButtonElement

  await act(async () => {
    salvar.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

describe("CaixaMovimentacaoModal — idempotência da movimentação", () => {
  it("reenvio após erro reusa EXATAMENTE a mesma chave", async () => {
    const chaves: string[] = []
    const onSubmit = async (p: Payload) => {
      chaves.push(p.idempotencyKey)
      return { ok: false as const, error: "Falha de rede" }
    }

    renderModal(true, onSubmit)

    await submeter("500")
    await submeter("500")
    await submeter("500")

    expect(chaves).toHaveLength(3)
    expect(chaves[0]).toBeTruthy()
    // Chaves diferentes aqui significam sangria registrada 3x no fechamento.
    expect(new Set(chaves).size).toBe(1)
  })

  it("reabrir o modal gera chave nova (operação nova, não reenvio)", async () => {
    const chaves: string[] = []
    const onSubmit = async (p: Payload) => {
      chaves.push(p.idempotencyKey)
      return { ok: false as const, error: "Falha de rede" }
    }

    renderModal(true, onSubmit)
    await submeter("500")

    // Operador cancelou (ou concluiu) e abriu de novo: é outra sangria.
    renderModal(false, onSubmit)
    renderModal(true, onSubmit)
    await submeter("500")

    expect(chaves).toHaveLength(2)
    expect(chaves[0]).not.toBe(chaves[1])
  })

  it("valor inválido não consome nem troca a chave", async () => {
    const chaves: string[] = []
    const onSubmit = async (p: Payload) => {
      chaves.push(p.idempotencyKey)
      return { ok: false as const, error: "Falha de rede" }
    }

    renderModal(true, onSubmit)

    await submeter("0") // rejeitado antes do onSubmit
    await submeter("500")
    await submeter("500")

    expect(chaves).toHaveLength(2)
    expect(chaves[0]).toBe(chaves[1])
  })
})
