/**
 * Mensagens do motor para a tela: o motor identifica itens pelo id (UUID); o usuário precisa do nome.
 * Funções puras — o adapter (`importIntelligence.ts`) continua devolvendo `CODIGO: detalhe` intacto.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Erros do motor com chave de tradução própria (o restante cai em `erro_entrada_invalida`). */
const CHAVE_POR_CODIGO: Record<string, string> = {
  LANDED_QTD_FATOR_INCONSISTENTE: 'erro_qtd_fator',
}

/** Troca cada UUID de item pelo nome (descrição) do item; ids desconhecidos ficam como estão. */
export function detalheComNomes(detalhe: string, itens: readonly { id: string; descricao: string }[]): string {
  const nomes = new Map(itens.map((i) => [i.id.toLowerCase(), i.descricao]))
  return detalhe.replace(UUID, (id) => {
    const nome = nomes.get(id.toLowerCase())
    return nome ? `"${nome}"` : id
  })
}

/** `CODIGO: detalhe` do adapter → chave i18n + detalhe legível (nome do item em vez do id). */
export function erroEntradaLegivel(
  detalhe: string | undefined,
  itens: readonly { id: string; descricao: string }[],
): { erro: string; detalhe?: string } {
  if (!detalhe) return { erro: 'erro_entrada_invalida' }
  const sep = detalhe.indexOf(':')
  const codigo = sep >= 0 ? detalhe.slice(0, sep).trim() : ''
  const resto = sep >= 0 ? detalhe.slice(sep + 1).trim() : detalhe
  const chave = CHAVE_POR_CODIGO[codigo]
  if (chave) return { erro: chave, ...(resto ? { detalhe: detalheComNomes(resto, itens) } : {}) }
  return { erro: 'erro_entrada_invalida', detalhe: detalheComNomes(detalhe, itens) }
}
