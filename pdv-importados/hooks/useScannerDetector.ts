import { useEffect, useRef } from "react"

type UseScannerDetectorOptions = {
  enabled?: boolean
  maxIntervalMs?: number
  flushTimeoutMs?: number
  minLength?: number
  ignoreWhen?: (target: EventTarget | null) => boolean
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

export function useScannerDetector(
  onScan: (code: string) => void,
  options: UseScannerDetectorOptions = {},
) {
  const {
    enabled = true,
    maxIntervalMs = 40,
    flushTimeoutMs = 100,
    minLength = 3,
    ignoreWhen,
  } = options

  const bufferRef = useRef("")
  const lastKeyTimeRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const clearBuffer = () => {
      bufferRef.current = ""
      lastKeyTimeRef.current = 0
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const scheduleFlush = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(clearBuffer, flushTimeoutMs)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (ignoreWhen?.(e.target) ?? isEditableTarget(e.target)) {
        clearBuffer()
        return
      }

      if (e.key === "Enter") {
        const code = bufferRef.current.trim()
        if (code.length >= minLength) onScan(code)
        clearBuffer()
        return
      }

      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) {
        clearBuffer()
        return
      }

      const now = Date.now()
      const elapsed = now - lastKeyTimeRef.current
      const isFirst = bufferRef.current.length === 0
      const isFastEnough = isFirst || elapsed <= maxIntervalMs

      if (!isFastEnough) {
        clearBuffer()
      }

      bufferRef.current += e.key
      lastKeyTimeRef.current = now
      scheduleFlush()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [enabled, flushTimeoutMs, ignoreWhen, maxIntervalMs, minLength, onScan])
}

