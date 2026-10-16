// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { imprimirBlobPdf } from './gerarPdf'

describe('imprimirBlobPdf', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('carrega o PDF num iframe oculto e abre o diálogo de impressão', () => {
    vi.useFakeTimers()
    const createUrl = vi.fn(() => 'blob:etiquetas')
    const revokeUrl = vi.fn()
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl })

    imprimirBlobPdf(new Blob(['%PDF'], { type: 'application/pdf' }))

    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe!.getAttribute('src')).toBe('blob:etiquetas')
    expect(iframe!.getAttribute('aria-hidden')).toBe('true')

    const print = vi.fn()
    Object.defineProperty(iframe!, 'contentWindow', { value: { focus: vi.fn(), print } })
    iframe!.onload?.(new Event('load'))
    expect(print).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    expect(document.querySelector('iframe')).toBeNull()
    expect(revokeUrl).toHaveBeenCalledWith('blob:etiquetas')
  })
})
