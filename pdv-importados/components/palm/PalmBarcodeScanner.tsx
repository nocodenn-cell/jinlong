'use client'

import { useEffect, useRef, useState } from 'react'
import { aceitarLeitura, type LeituraEstado } from '@/app/palm/domain/barcodeLeitura'

type Rotulos = {
  lendo: string
  permissao: string
  incompativel: string
  fechar: string
}

type Props = {
  aberto: boolean
  rotulos: Rotulos
  onCodigo: (codigo: string) => void
  onFechar: () => void
}

type DetectorCtor = new (opts: { formats: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

const FORMATOS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']

export function PalmBarcodeScanner({ aberto, rotulos, onCodigo, onFechar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return undefined
    return iniciarCamera(videoRef, onCodigo, (mensagem) => setErro(mensagem), rotulos)
  }, [aberto, onCodigo, rotulos])

  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 p-3 sm:justify-center">
      <video
        ref={videoRef}
        className="mx-auto aspect-[3/4] w-full max-w-md rounded-lg bg-muted object-cover"
        muted
        playsInline
        data-testid="palm-camera"
      />
      <p className="mt-3 text-center text-sm text-white">{erro ?? rotulos.lendo}</p>
      <button type="button" className="mx-auto mt-3 min-h-11 rounded-md bg-white px-4 text-black" onClick={onFechar}>
        {rotulos.fechar}
      </button>
    </div>
  )
}

function iniciarCamera(
  videoRef: { current: HTMLVideoElement | null },
  onCodigo: (codigo: string) => void,
  setErro: (mensagem: string) => void,
  rotulos: Rotulos,
): () => void {
  let parado = false
  let frame = 0
  let stream: MediaStream | null = null
  let pararZxing: (() => void) | null = null
  const estado = { atual: null as LeituraEstado | null }

  const entregar = (codigo: string) => {
    const decisao = aceitarLeitura(estado.atual, codigo, Date.now())
    estado.atual = decisao.estado
    if (decisao.aceitar) onCodigo(decisao.estado.codigo)
  }

  void abrir(videoRef, entregar, setErro, rotulos, () => parado, (valor) => { stream = valor }, (id) => { frame = id }, (parar) => { pararZxing = parar })

  return () => {
    parado = true
    if (frame) cancelAnimationFrame(frame)
    pararZxing?.()
    stream?.getTracks().forEach((trilha) => trilha.stop())
  }
}

async function abrir(
  videoRef: { current: HTMLVideoElement | null },
  entregar: (codigo: string) => void,
  setErro: (mensagem: string) => void,
  rotulos: Rotulos,
  parado: () => boolean,
  guardarStream: (stream: MediaStream) => void,
  guardarFrame: (id: number) => void,
  guardarZxing: (parar: () => void) => void,
): Promise<void> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  } catch {
    setErro(rotulos.permissao)
    return
  }
  guardarStream(stream)
  const video = videoRef.current
  if (!video || parado()) {
    stream.getTracks().forEach((trilha) => trilha.stop())
    return
  }
  video.srcObject = stream
  await video.play()
  const nativo = await lerComDetector(video, entregar, parado, guardarFrame)
  if (nativo || parado()) return
  await lerComZxing(stream, video, entregar, setErro, rotulos.incompativel, guardarZxing)
}

async function lerComDetector(
  video: HTMLVideoElement,
  entregar: (codigo: string) => void,
  parado: () => boolean,
  guardarFrame: (id: number) => void,
): Promise<boolean> {
  const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  if (!Detector) return false
  try {
    const det = new Detector({ formats: FORMATOS })
    const tick = async () => {
      if (parado()) return
      const codes = await det.detect(video).catch(() => [])
      const valor = codes[0]?.rawValue
      if (valor) entregar(valor)
      guardarFrame(requestAnimationFrame(() => { void tick() }))
    }
    void tick()
    return true
  } catch {
    return false
  }
}

async function lerComZxing(
  stream: MediaStream,
  video: HTMLVideoElement,
  entregar: (codigo: string) => void,
  setErro: (mensagem: string) => void,
  incompativel: string,
  guardarZxing: (parar: () => void) => void,
): Promise<void> {
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser')
    const reader = new BrowserMultiFormatReader()
    const controles = await reader.decodeFromStream(stream, video, (resultado) => {
      if (resultado) entregar(resultado.getText())
    })
    guardarZxing(() => controles.stop())
  } catch {
    setErro(incompativel)
  }
}
