import { InlineAlert } from '@/components/ui/InlineAlert'

/** Aviso Go-Live: emissão real fora do escopo; fila opera em Stub. */
type Props = Readonly<{
  titulo: string
  subtitulo: string
}>

export function FiscalStubNotice({ titulo, subtitulo }: Props) {
  return (
    <div data-testid="financeiro-fiscal-stub-notice" className="mb-3">
      <InlineAlert tone="warning" title={titulo}>
        {subtitulo}
      </InlineAlert>
    </div>
  )
}
