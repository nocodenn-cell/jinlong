"use client"

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react"
import { formatDecimalBRL } from "@/lib/format/money"

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number
  onValueChange: (value: number) => void
}

export function CaixaMoneyInput({ value, onValueChange, ...props }: Props) {
  const [text, setText] = useState(() => value ? formatDecimalBRL(value) : "")
  const focused = useRef(false)
  const emitted = useRef(value)
  useEffect(() => {
    if (!focused.current || value !== emitted.current) setText(value ? formatDecimalBRL(value) : "")
    emitted.current = value
  }, [value])
  function change(raw: string) {
    const normalized = raw.replace(/\./g, raw.includes(",") ? "" : ".").replace(",", ".")
    if (!/^\d*(?:\.\d{0,2})?$/.test(normalized)) return
    const parsed = normalized ? Number(normalized) : 0
    if (!Number.isFinite(parsed) || !Number.isSafeInteger(Math.round(parsed * 100))) return
    setText(raw)
    emitted.current = parsed
    onValueChange(emitted.current)
  }
  return <input {...props} type="text" inputMode="decimal" value={text}
    onFocus={() => { focused.current = true }}
    onChange={(event) => change(event.target.value)}
    onBlur={() => { focused.current = false; setText(value ? formatDecimalBRL(value) : "") }} />
}
