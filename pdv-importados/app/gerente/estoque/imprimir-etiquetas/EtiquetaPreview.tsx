'use client'

/**
 * Preview visual da etiqueta térmica (escala mm → CSS).
 * Reflete o layout gerado em `gerarPdf` (nome, preço, barcode).
 */

import { useEffect, useState } from 'react'
import type { EtiquetaConfig } from '@/lib/etiqueta/EtiquetaConfig'
import type { ItemCarrinho } from '@/lib/etiqueta/types'
import { formatDecimalBRL } from '@/lib/format/money'
import { gerarBarcodeParaPdf } from '@/lib/etiqueta/gerarBarcode'

type Props = Readonly<{
  item: ItemCarrinho | null
  config: EtiquetaConfig
  vazioLabel: string
  modeloLabel: string
}>

const PX_POR_MM = 3.2

function truncar(texto: string, max: number): string {
  if (texto.length <= max) return texto
  return `${texto.slice(0, max - 1)}…`
}

export function EtiquetaPreview({ item, config, vazioLabel, modeloLabel }: Props) {
  const [barcodeUrl, setBarcodeUrl] = useState<string | null>(null)
  const width = config.largura * PX_POR_MM
  const height = config.altura * PX_POR_MM
  const pad = config.margem * PX_POR_MM

  useEffect(() => {
    let cancelado = false
    setBarcodeUrl(null)
    if (!item?.codigoBarras) return
    void gerarBarcodeParaPdf(item.codigoBarras)
      .then((url) => {
        if (!cancelado) setBarcodeUrl(url)
      })
      .catch(() => {
        if (!cancelado) setBarcodeUrl(null)
      })
    return () => {
      cancelado = true
    }
  }, [item?.codigoBarras, item?.produtoId])

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-caption text-fg-muted">{modeloLabel}</p>
      <div
        className="relative overflow-hidden rounded-sm border border-dashed border-[var(--color-border)] bg-white text-black shadow-sm transition-[width,height] duration-300 ease-out"
        style={{ width, height, padding: pad }}
        aria-label={item ? `Preview ${item.nome}` : vazioLabel}
      >
        {!item ? (
          <p className="flex h-full items-center justify-center text-center text-[10px] text-neutral-400">
            {vazioLabel}
          </p>
        ) : (
          <div className="flex h-full flex-col">
            <p
              className="leading-tight"
              style={{ fontSize: config.fontSizeNome * 1.15 }}
            >
              {truncar(item.nome, config.maxCaracteresNome)}
            </p>
            <p
              className="mt-0.5 font-bold leading-tight"
              style={{ fontSize: config.fontSizePreco * 1.2 }}
            >
              R$ {formatDecimalBRL(item.precoVarejo)}
            </p>
            {item.atributo ? (
              <p style={{ fontSize: config.fontSizeAtributo * 1.1 }}>{item.atributo}</p>
            ) : null}
            <div className="mt-auto flex flex-col items-stretch gap-0.5">
              {barcodeUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL local do bwip-js
                <img
                  src={barcodeUrl}
                  alt=""
                  className="h-5 w-full object-contain"
                />
              ) : (
                <p
                  className="font-mono text-center text-neutral-600"
                  style={{ fontSize: config.fontSizeCodigo * 1.2 }}
                >
                  {item.codigoBarras || '—'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
