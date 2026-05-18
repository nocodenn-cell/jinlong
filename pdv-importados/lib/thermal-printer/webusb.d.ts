/** Minimal WebUSB typings for thermal printer adapter (not in all TS lib.dom builds). */

interface USBDeviceFilter {
  vendorId?: number
  productId?: number
}

interface USBOutTransferResult {
  status: 'ok' | 'stall' | 'babble'
  bytesWritten: number
}

interface USBEndpoint {
  endpointNumber: number
  type: 'bulk' | 'interrupt' | 'isochronous'
  direction: 'in' | 'out'
}

interface USBAlternateInterface {
  endpoints: USBEndpoint[]
}

interface USBInterface {
  interfaceNumber: number
  alternates: USBAlternateInterface[]
}

interface USBConfiguration {
  interfaces: USBInterface[]
}

interface USBDevice {
  vendorId: number
  productId: number
  productName?: string
  configuration: USBConfiguration | null
  open(): Promise<void>
  close(): Promise<void>
  selectConfiguration(configurationValue: number): Promise<void>
  claimInterface(interfaceNumber: number): Promise<void>
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>
}

interface USB {
  requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>
}

interface Navigator {
  readonly usb: USB
}
