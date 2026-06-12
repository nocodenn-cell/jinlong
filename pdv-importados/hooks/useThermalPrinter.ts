"use client"

import { useState, useCallback, useEffect } from "react"
import { WebUsbPrinter, type ThermalPrinterInfo } from "@/lib/thermal-printer/webUsbAdapter"
import { buildReciboEscPos } from "@/lib/thermal-printer/escpos"
import type { ReciboVenda, ReciboLabels } from "@/app/caixa/CaixaReciboModal"

export type ThermalStatus = "idle" | "connecting" | "connected" | "printing" | "error"

export type UseThermalPrinterReturn = {
  supported: boolean
  status: ThermalStatus
  deviceInfo: ThermalPrinterInfo | null
  savedInfo: ThermalPrinterInfo | null
  errorMsg: string | null
  connect: () => Promise<void>
  printRecibo: (venda: ReciboVenda, labels: ReciboLabels, cols?: number) => Promise<void>
  disconnect: () => Promise<void>
}

export function useThermalPrinter(): UseThermalPrinterReturn {
  const printer = WebUsbPrinter.getInstance()

  const [status, setStatus]         = useState<ThermalStatus>(() =>
    printer.isConnected() ? "connected" : "idle",
  )
  const [deviceInfo, setDeviceInfo] = useState<ThermalPrinterInfo | null>(() =>
    printer.getInfo(),
  )
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [savedInfo]                 = useState<ThermalPrinterInfo | null>(() =>
    WebUsbPrinter.getSavedInfo(),
  )

  // Keep status in sync if the singleton was already connected before mount;
  // caso contrário, tenta reabrir silenciosamente uma impressora já autorizada
  // (sem picker) — elimina o atrito de re-selecionar a impressora após reload.
  useEffect(() => {
    if (printer.isConnected()) {
      setStatus("connected")
      setDeviceInfo(printer.getInfo())
      return
    }
    if (!WebUsbPrinter.isSupported()) return
    let cancelled = false
    void printer
      .reconnect()
      .then((info) => {
        if (cancelled || !info) return
        setDeviceInfo(info)
        setStatus("connected")
      })
      .catch((e) => {
        if (!cancelled) console.warn('[useThermalPrinter] reconnect failed:', e instanceof Error ? e.message : e)
      })
    return () => {
      cancelled = true
    }
  }, [printer])

  // React to physical cable disconnect via the WebUSB event (no polling needed)
  useEffect(() => {
    if (!WebUsbPrinter.isSupported()) return
    const usbBus = navigator.usb as unknown as EventTarget
    const onDisconnect = (e: Event) => {
      const device = (e as Event & { device?: USBDevice }).device
      if (device && printer.markDisconnected(device)) {
        setStatus("idle")
        setDeviceInfo(null)
        setErrorMsg("Impressora desconectada.")
      }
    }
    usbBus.addEventListener("disconnect", onDisconnect)
    return () => usbBus.removeEventListener("disconnect", onDisconnect)
  }, [printer])

  const connect = useCallback(async () => {
    setStatus("connecting")
    setErrorMsg(null)
    try {
      const info = await printer.connect()
      setDeviceInfo(info)
      setStatus("connected")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro ao conectar impressora.")
      setStatus("error")
    }
  }, [printer])

  const printRecibo = useCallback(
    async (venda: ReciboVenda, labels: ReciboLabels, cols = 32) => {
      setStatus("printing")
      setErrorMsg(null)
      try {
        const buffer = buildReciboEscPos(venda, labels, cols)
        await printer.print(buffer)
        setStatus("connected")
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Erro ao imprimir.")
        setStatus("error")
      }
    },
    [printer],
  )

  const disconnect = useCallback(async () => {
    await printer.disconnect()
    setDeviceInfo(null)
    setStatus("idle")
    setErrorMsg(null)
  }, [printer])

  return {
    supported: WebUsbPrinter.isSupported(),
    status,
    deviceInfo,
    savedInfo,
    errorMsg,
    connect,
    printRecibo,
    disconnect,
  }
}
