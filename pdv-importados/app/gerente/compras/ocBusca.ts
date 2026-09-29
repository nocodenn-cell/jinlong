/**
 * Filtro de busca de Ordens de Compra (`listarOrdensCompra`), no formato do `.or()` do PostgREST.
 *
 * `ordens_compra.id` é `uuid`: `id.ilike.%x%` não existe no Postgres
 * (`operator does not exist: uuid ~~* unknown`) e a consulta inteira falhava — o autocomplete do
 * recebimento e a busca de Compras voltavam sempre vazios. O operador vê o ID como o código curto
 * (8 primeiros caracteres do uuid, `fmtGerenteIdCurto`) e a busca já prometia "ID", então o ID
 * continua pesquisável, por PREFIXO, com uma faixa de uuid (`gte`/`lte`), que o PostgREST aceita
 * sem cast.
 */

/** Menor prefixo hexadecimal tratado como ID — abaixo disso "ca", "bad" etc. casariam qualquer coisa. */
const MIN_HEX_ID = 6

/** Completa um prefixo hexadecimal (1 a 32 dígitos) até um uuid, usando `fill` nos dígitos que faltam. */
function uuidDePrefixo(hex: string, fill: '0' | 'f'): string {
  const h = hex.padEnd(32, fill)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * `null` quando não há o que buscar. Vírgula, parênteses, `%`, `_` e barra invertida são sintaxe do
 * `.or()`/LIKE e viram espaço (mesma limpeza da busca de produtos do recebimento).
 */
export function montarFiltroBuscaOc(busca: string | null | undefined): string | null {
  const termo = (busca ?? '').replace(/[,()%_\\]/g, ' ').trim()
  if (!termo) return null

  const condicoes = [`fornecedor_nome.ilike.%${termo}%`]

  const hex = termo.replace(/-/g, '').toLowerCase()
  if (hex.length >= MIN_HEX_ID && hex.length <= 32 && /^[0-9a-f]+$/.test(hex)) {
    condicoes.push(`and(id.gte.${uuidDePrefixo(hex, '0')},id.lte.${uuidDePrefixo(hex, 'f')})`)
  }
  return condicoes.join(',')
}
