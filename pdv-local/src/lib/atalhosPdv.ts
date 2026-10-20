/**
 * Mapa de atalhos de teclado do PDV desktop. Lógica pura (testável sem DOM):
 * o App registra um único listener de keydown e despacha a ação devolvida
 * aqui, chamando as mesmas funções dos botões.
 */
export type AcaoAtalhoPdv = 'abrirCaixa' | 'fecharCaixa' | 'movimentoCaixa' | 'finalizar' | 'novoCupom'

export type EstadoAtalhosPdv = {
  caixaAberto: boolean
  temItens: boolean
  finalizando: boolean
  /** Um modal/diálogo aberto trata as próprias teclas: atalhos globais ficam inativos. */
  modalAberto: boolean
}

export type ResultadoAtalhoPdv = {
  /** Ação a executar, ou null quando a tecla não é atalho ou o botão está indisponível. */
  acao: AcaoAtalhoPdv | null
  /** Chamar preventDefault (F-keys sempre, para evitar padrões do navegador como F3 = localizar). */
  prevenirPadrao: boolean
}

const NADA: ResultadoAtalhoPdv = { acao: null, prevenirPadrao: false }

export function resolverAtalhoPdv(
  tecla: string,
  estado: EstadoAtalhosPdv,
  opcoes: { repeticao?: boolean; jaTratado?: boolean } = {},
): ResultadoAtalhoPdv {
  if (estado.modalAberto || opcoes.jaTratado) return NADA
  const ehTeclaF = tecla === 'F2' || tecla === 'F3' || tecla === 'F4' || tecla === 'F10'
  if (!ehTeclaF && tecla !== 'Escape') return NADA
  const bloqueado: ResultadoAtalhoPdv = { acao: null, prevenirPadrao: ehTeclaF }
  if (opcoes.repeticao) return bloqueado

  switch (tecla) {
    case 'F2':
      return estado.caixaAberto ? bloqueado : { acao: 'abrirCaixa', prevenirPadrao: true }
    case 'F3':
      return estado.caixaAberto ? { acao: 'fecharCaixa', prevenirPadrao: true } : bloqueado
    case 'F4':
      return estado.caixaAberto ? { acao: 'movimentoCaixa', prevenirPadrao: true } : bloqueado
    case 'F10':
      return estado.temItens && !estado.finalizando ? { acao: 'finalizar', prevenirPadrao: true } : bloqueado
    case 'Escape':
      // "Novo Cupom" exige confirmação (2º toque em até 2s): nunca descarta a venda de primeira.
      return estado.temItens && !estado.finalizando ? { acao: 'novoCupom', prevenirPadrao: true } : NADA
    default:
      return NADA
  }
}

/** Há modal aberto no documento? (diálogos acessíveis ou <dialog open>). */
export function existeModalAberto(doc: Pick<Document, 'querySelector'> | undefined = globalThis.document): boolean {
  if (!doc) return false
  return Boolean(doc.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"], dialog[open]'))
}
