"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"
import { buscarClientesCaixa } from "@/app/caixa/actions"

type Cliente = {
  id: string
  nome: string
  documento?: string
}

type Props = {
  aberto: boolean
  m: Mensagens
  onSelecionado: (clienteId: string) => void
  onCancelado: () => void
}

export function CaixaSelecionarClienteModal({ aberto, m, onSelecionado, onCancelado }: Props) {
  const [busca, setBusca] = useState("")
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!aberto) return
    queueMicrotask(() => inputRef.current?.focus())
  }, [aberto])

  const executarBusca = useCallback(async () => {
    if (!busca.trim()) {
      setClientes([])
      return
    }

    setCarregando(true)
    try {
      const resultado = await buscarClientesCaixa(busca.trim())

      if (resultado.ok && resultado.clientes) {
        setClientes(
          resultado.clientes.map((c) => ({
            id: c.id,
            nome: c.nome,
            documento: c.documento ?? undefined,
          })),
        )
      } else {
        setClientes([])
      }
    } catch {
      setClientes([])
    } finally {
      setCarregando(false)
    }
  }, [busca])

  return (
    <DragonModal
      open={aberto}
      onClose={onCancelado}
      title={m.caixa.selecionar_cliente_titulo}
      closeLabel={m.comum.fechar}
      data-testid="caixa-selecionar-cliente-modal"
      footer={
        <Button type="button" variant="secondary" onClick={onCancelado}>
          {m.comum.cancelar}
        </Button>
      }
    >
      <div className="space-y-4" data-caixa-atalho-bloqueado="true">
        <div className="flex flex-col gap-2">
          <label htmlFor="busca-cliente" className="text-xs text-jl-fg-3">
            {m.caixa.selecionar_cliente_busca_label}
          </label>
          <div className="flex gap-2">
            <Input
              id="busca-cliente"
              ref={inputRef}
              type="text"
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void executarBusca()
                }
              }}
              placeholder={m.caixa.selecionar_cliente_placeholder}
              className="jl-modal-field flex-1"
            />
            <Button
              type="button"
              onClick={() => void executarBusca()}
              disabled={carregando || !busca.trim()}
              className="min-h-10 shrink-0"
            >
              {carregando ? m.caixa.selecionar_cliente_buscando : m.caixa.selecionar_cliente_buscar}
            </Button>
          </div>
        </div>

        {clientes.length > 0 ? (
          <div className="max-h-64 overflow-y-auto rounded-md border border-jl-border-1">
            {clientes.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                onClick={() => {
                  onSelecionado(cliente.id)
                  setBusca("")
                  setClientes([])
                }}
                className="w-full border-b border-jl-border-1/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-white/[0.04]"
              >
                <div className="font-medium">{cliente.nome}</div>
                {cliente.documento ? (
                  <div className="text-xs text-jl-fg-3">{cliente.documento}</div>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        {busca && clientes.length === 0 && !carregando ? (
          <p className="rounded-md bg-white/[0.04] px-3 py-3 text-center text-sm text-jl-fg-3">
            {m.caixa.selecionar_cliente_vazio}
          </p>
        ) : null}
      </div>
    </DragonModal>
  )
}
