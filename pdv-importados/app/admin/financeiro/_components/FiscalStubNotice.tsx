/** Aviso Go-Live: emissão real fora do escopo; fila opera em Stub. */

type Props = Readonly<{
  titulo: string
  subtitulo: string
}>

export function FiscalStubNotice({ titulo, subtitulo }: Props) {
  return (
    <div
      className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
      role="status"
      data-testid="financeiro-fiscal-stub-notice"
    >
      <p className="text-xs font-semibold text-amber-950">{titulo}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-amber-900/90">{subtitulo}</p>
    </div>
  )
}
