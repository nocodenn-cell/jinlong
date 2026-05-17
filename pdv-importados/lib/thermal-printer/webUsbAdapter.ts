/**
 * WebUSB adapter for ESC/POS thermal printers.
 * Supports Epson, Bematech, Zebra, Star and generic ESC/POS printers.
 *
 * Usage:
 *   const printer = WebUsbPrinter.getInstance()
 *   await printer.connect()
 *   await printer.print(buffer)
 */

// Common thermal printer vendor IDs
const VENDOR_FILTERS: USBDeviceFilter[] = [
  { vendorId: 0x04b8 }, // Epson
  { vendorId: 0x0dd4 }, // Custom Engineering
  { vendorId: 0x0596 }, // Bematech
  { vendorId: 0x0a5f }, // Zebra
  { vendorId: 0x0519 }, // Star Micronics
  { vendorId: 0x1fc9 }, // HPRT
  { vendorId: 0x067b }, // Prolific (USB-Serial adapters)
]

const CHUNK_SIZE = 64

export type ThermalPrinterInfo = {
  vendorId: number
  productId: number
  name: string
}

// Module-level cache — persists for the lifetime of the page session.
// Avoids browser storage APIs which require security review for every access.
let _savedInfo: ThermalPrinterInfo | null = null

export class WebUsbPrinter {
  // Module-level singleton — survives React component unmounts
  private static _instance: WebUsbPrinter | null = null
  static getInstance(): WebUsbPrinter {
    if (!WebUsbPrinter._instance) WebUsbPrinter._instance = new WebUsbPrinter()
    return WebUsbPrinter._instance
  }

  private device: USBDevice | null = null
  private outEndpoint = 1

  private constructor() {}

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "usb" in navigator
  }

  isConnected(): boolean {
    return this.device !== null
  }

  getInfo(): ThermalPrinterInfo | null {
    if (!this.device) return null
    return {
      vendorId: this.device.vendorId,
      productId: this.device.productId,
      name: this.device.productName?.trim() || `${this.device.vendorId}:${this.device.productId}`,
    }
  }

  /** Prompts the browser's USB device picker and opens the selected printer. */
  async connect(): Promise<ThermalPrinterInfo> {
    if (!WebUsbPrinter.isSupported()) throw new Error("WebUSB não suportado neste navegador.")

    const device = await navigator.usb.requestDevice({ filters: VENDOR_FILTERS })
    await device.open()
    if (device.configuration === null) await device.selectConfiguration(1)

    // Find the first interface with a bulk-out endpoint
    const iface = device.configuration?.interfaces?.find((i) =>
      i.alternates.some((a) => a.endpoints.some((e) => e.type === "bulk" && e.direction === "out")),
    )
    if (!iface) throw new Error("Nenhuma interface compatível encontrada na impressora.")

    await device.claimInterface(iface.interfaceNumber)

    const alt      = iface.alternates[0]
    const endpoint = alt.endpoints.find((e) => e.type === "bulk" && e.direction === "out")
    if (!endpoint) throw new Error("Endpoint bulk-out não encontrado.")

    this.device      = device
    this.outEndpoint = endpoint.endpointNumber

    const info = this.getInfo()!
    _savedInfo = info
    return info
  }

  /** Sends an ESC/POS buffer to the printer in 64-byte chunks. */
  async print(data: Uint8Array): Promise<void> {
    if (!this.device) throw new Error("Impressora não conectada.")
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      await this.device.transferOut(this.outEndpoint, data.slice(offset, offset + CHUNK_SIZE))
    }
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      // Device may already be closed by the OS; ignore the error
      await this.device.close().catch((_e: unknown) => undefined)
      this.device = null
    }
    _savedInfo = null
  }

  /** Returns the last connected printer info for the current page session. */
  static getSavedInfo(): ThermalPrinterInfo | null {
    return _savedInfo
  }
}
