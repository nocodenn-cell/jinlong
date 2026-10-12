export type LeituraEstado = {
  codigo: string
  em: number
}

/** Ignora o mesmo código repetido dentro da janela — a câmera entrega o frame várias vezes. */
export function aceitarLeitura(
  estado: LeituraEstado | null,
  codigo: string,
  agora: number,
  janelaMs = 1500,
): { aceitar: boolean; estado: LeituraEstado } {
  const limpo = codigo.trim()
  if (!limpo) {
    return { aceitar: false, estado: estado ?? { codigo: '', em: agora } }
  }
  if (estado && estado.codigo === limpo && agora - estado.em < janelaMs) {
    return { aceitar: false, estado }
  }
  return { aceitar: true, estado: { codigo: limpo, em: agora } }
}
