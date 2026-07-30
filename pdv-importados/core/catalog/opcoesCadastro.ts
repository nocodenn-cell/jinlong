/**
 * Quais opções de cadastro (categoria/marca) o formulário pode oferecer.
 *
 * Decisão registrada em `Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md`:
 * inativar uma opção tira ela das escolhas NOVAS, mas nunca apaga o vínculo de um
 * produto que já a usa. Se o seletor simplesmente escondesse a opção inativa, o
 * `<select>` do produto vinculado cairia na opção vazia e salvar apagaria o
 * vínculo silenciosamente — perda de dado disfarçada de edição normal.
 */

export type OpcaoCadastro = Readonly<{
  id: string
  nome: string
  /** Ausente = tratada como ativa (compatível com quem ainda não envia o campo). */
  ativo?: boolean
}>

export function isOpcaoAtiva(opcao: OpcaoCadastro): boolean {
  return opcao.ativo !== false
}

/**
 * Opções renderizáveis: todas as ativas, mais a atualmente selecionada mesmo
 * que inativa (para preservar o vínculo do produto em edição).
 */
export function opcoesSelecionaveis<T extends OpcaoCadastro>(
  opcoes: readonly T[],
  valorSelecionado: string,
): T[] {
  return opcoes.filter((o) => isOpcaoAtiva(o) || o.id === valorSelecionado)
}

/** A opção selecionada existe mas está inativa? A UI sinaliza isso ao operador. */
export function selecionadaEstaInativa(
  opcoes: readonly OpcaoCadastro[],
  valorSelecionado: string,
): boolean {
  if (!valorSelecionado) return false
  const atual = opcoes.find((o) => o.id === valorSelecionado)
  return atual !== undefined && !isOpcaoAtiva(atual)
}
