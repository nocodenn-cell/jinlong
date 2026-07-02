"use client"

import { memo, useState, type FormEvent } from "react"

type Props = Readonly<{
  enabled: boolean
  onCommand: (command: string, payload: { codigo: string }) => void
}>

function InputScannerImpl({ enabled, onCommand }: Props) {
  const [codigo, setCodigo] = useState("")

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const valor = codigo.trim()
    if (!enabled || valor === "") return
    onCommand("CMD_ITEM_SCAN", { codigo: valor })
    setCodigo("")
  }

  return (
    <form onSubmit={handleSubmit} data-testid="input-scanner">
      <input
        type="text"
        inputMode="text"
        autoFocus={enabled}
        disabled={!enabled}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="Bipar ou digitar código"
        aria-label="Código do produto"
        className="w-full rounded border px-3 py-2 disabled:opacity-50"
      />
    </form>
  )
}

export const InputScanner = memo(InputScannerImpl)
