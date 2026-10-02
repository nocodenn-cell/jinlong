/**
 * Kardex — "Saldo após" derivado (apresentação). O log não grava o saldo de cada movimento, então
 * ele é reconstruído de trás para frente a partir do saldo atual (`estoque.quantidade_atual`):
 * saldo após o movimento mais novo = saldo atual; cada movimento mais antigo = saldo do seguinte
 * menos o delta do seguinte.
 *
 * Só é confiável se o histórico fecha com o saldo atual (soma de todos os deltas = saldo atual).
 * Se não fecha (estoque inicial sem lançamento, histórico truncado), NÃO inventa número: devolve null.
 */

const EPS = 0.0005

function r3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * @param deltasNovoParaAntigo deltas dos movimentos exibidos, do mais novo para o mais antigo
 * @param saldoAtual saldo atual do produto na loja (null se não houver linha de estoque)
 * @param somaTodosDeltas soma de TODOS os deltas do produto (null se o total não pôde ser lido por inteiro)
 */
export function calcularSaldoApos(
  deltasNovoParaAntigo: readonly number[],
  saldoAtual: number | null,
  somaTodosDeltas: number | null,
): Array<number | null> {
  const vazio = deltasNovoParaAntigo.map(() => null)
  if (saldoAtual == null || somaTodosDeltas == null) return vazio
  if (Math.abs(somaTodosDeltas - saldoAtual) > EPS) return vazio

  const out: number[] = []
  let saldo = saldoAtual
  for (const delta of deltasNovoParaAntigo) {
    out.push(r3(saldo))
    saldo -= delta
  }
  return out
}
