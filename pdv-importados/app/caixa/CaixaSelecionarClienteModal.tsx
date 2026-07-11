"use client"

import { useCallback, useState } from "react"
import { buscarClientesPaginadosAction } from "@/app/gerente/clientes/actions"

type Cliente = {
  id: string
  nome: string
  documento?: string
}

type Props = {
  aberto: boolean
  onSelecionado: (clienteId: string) => void
  onCancelado: () => void
}

export function CaixaSelecionarClienteModal({ aberto, onSelecionado, onCancelado }: Props) {
  const [busca, setBusca] = useState("")
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(false)

  const executarBusca = useCallback(async () => {
    if (!busca.trim()) {
      setClientes([])
      return
    }

    setCarregando(true)
    try {
      const resultado = await buscarClientesPaginadosAction({
        pagina: 1,
        limite: 20,
        busca: busca.trim(),
      })

      if (resultado.ok && resultado.clientes) {
        setClientes(
          resultado.clientes.map((c: any) => ({
            id: c.id,
            nome: c.nome,
            documento: c.documento,
          }))
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

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Selecionar Cliente</h2>

        <div className="mb-4 flex flex-col gap-2">
          <label htmlFor="busca-cliente" className="text-sm font-medium">
            Buscar por nome ou CPF
          </label>
          <div className="flex gap-2">
            <input
              id="busca-cliente"
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") executarBusca()
              }}
              placeholder="Digite o nome ou CPF..."
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <button
              onClick={executarBusca}
              disabled={carregando || !busca.trim()}
              className="rounded bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:bg-gray-300"
            >
              {carregando ? "..." : "Buscar"}
            </button>
          </div>
        </div>

        {clientes.length > 0 && (
          <div className="mb-4 max-h-64 overflow-y-auto rounded border border-gray-200">
            {clientes.map((cliente) => (
              <button
                key={cliente.id}
                onClick={() => {
                  onSelecionado(cliente.id)
                  setBusca("")
                  setClientes([])
                }}
                className="w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-blue-50"
              >
                <div className="font-medium">{cliente.nome}</div>
                {cliente.documento && <div className="text-xs text-gray-500">{cliente.documento}</div>}
              </button>
            ))}
          </div>
        )}

        {busca && clientes.length === 0 && !carregando && (
          <div className="mb-4 rounded bg-gray-100 p-3 text-center text-sm text-gray-600">
            Nenhum cliente encontrado
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancelado}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
