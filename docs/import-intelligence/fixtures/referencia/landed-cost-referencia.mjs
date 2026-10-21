// Verificador de referência para os fixtures do motor de landed cost.
//
// NÃO é código de aplicação: não é importado por nada em shared-core, pdv-importados
// ou backend. Existe para fixar a aritmética dos casos em docs/import-intelligence/fixtures
// e para ser comparado com a implementação futura em shared-core/src/import/.
//
// Uso:
//   node landed-cost-referencia.mjs            → verifica todos os casos (PASS/FAIL)
//   node landed-cost-referencia.mjs --gerar    → regrava expected.json (usar só com revisão)
//
// Convenções (ver 07-MOTOR-CONTRATO-MINIMO.md):
//   - Tudo em BigInt escalado. Nenhum cálculo com number.
//   - Entrada de dinheiro: até 6 casas. Taxa: 10 casas. Quantidades e pesos: 3 casas. Fator: 6 casas.
//   - Cálculo intermediário na escala 10. Rateio exato na escala 10 (resto pelo maior resto).
//   - Arredondamento de persistência: HALF_UP (proposta, aguarda DECISÃO-06).

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENGINE_VERSION = 'landed-cost-ref/0.1.0'
const ESC_INTERMEDIARIA = 10
const CRITERIOS = ['VALOR_ADUANEIRO', 'PESO_LIQUIDO', 'PESO_BRUTO', 'VOLUME', 'QUANTIDADE_ESTOQUE']

class LandedErro extends Error {
  constructor(codigo, detalhe) {
    super(codigo)
    this.codigo = codigo
    this.detalhe = detalhe ?? null
  }
}
const erro = (codigo, detalhe) => { throw new LandedErro(codigo, detalhe) }

const pow10 = (n) => 10n ** BigInt(n)

// "123.45" com escala máxima → BigInt na escala `escala`. Rejeita excesso de casas.
function lerDec(valor, escala, campo, { opcional = false } = {}) {
  if (valor === null || valor === undefined) {
    if (opcional) return null
    erro('LANDED_DADO_AUSENTE', campo)
  }
  if (typeof valor !== 'string' || !/^-?\d+(\.\d+)?$/.test(valor)) erro('LANDED_DECIMAL_FORMATO', campo)
  const neg = valor.startsWith('-')
  const [ip, fp = ''] = valor.replace('-', '').split('.')
  if (fp.length > escala) erro('LANDED_DECIMAL_ESCALA_EXCEDIDA', campo)
  const n = BigInt(ip + fp.padEnd(escala, '0'))
  return neg ? -n : n
}

// Divisão inteira com arredondamento HALF_UP (longe de zero no empate).
function arredonda(n, d) {
  if (d <= 0n) throw new Error('divisor não positivo')
  const neg = n < 0n
  const a = neg ? -n : n
  let q = a / d
  if ((a % d) * 2n >= d) q += 1n
  return neg ? -q : q
}

// Reescala um valor de `de` casas para `para` casas, com arredondamento.
function reescala(v, de, para) {
  if (de === para) return v
  if (de < para) return v * pow10(para - de)
  return arredonda(v, pow10(de - para))
}

// Multiplicação de dois decimais e reescala para a escala intermediária.
function multiplicaS10(a, sa, b, sb) {
  return arredonda(a * b, pow10(sa + sb - ESC_INTERMEDIARIA))
}

// BigInt na escala `esc` → string decimal com exatamente `esc` casas.
function fmt(v, esc) {
  const neg = v < 0n
  const a = neg ? -v : v
  const p = pow10(esc)
  const ip = a / p
  const fp = (a % p).toString().padStart(esc, '0')
  return (neg ? '-' : '') + ip.toString() + (esc > 0 ? '.' + fp : '')
}

// Rateio exato. `total` na escala intermediária. Resto pelo maior resto, empate por id ascendente.
function ratear(total, bases) {
  const ordenadas = [...bases].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  const soma = ordenadas.reduce((s, x) => s + x.b, 0n)
  if (soma <= 0n) erro('LANDED_RATEIO_BASE_ZERO')
  const neg = total < 0n
  const T = neg ? -total : total
  const linhas = ordenadas.map((x) => {
    const num = T * x.b
    return { id: x.id, q: num / soma, r: num % soma }
  })
  let resto = T - linhas.reduce((s, l) => s + l.q, 0n)
  const porResto = [...linhas].sort((a, b) => (b.r !== a.r ? (b.r > a.r ? 1 : -1) : a.id < b.id ? -1 : 1))
  for (let i = 0; resto > 0n; i++, resto--) porResto[i].q += 1n
  return linhas.map((l) => ({ id: l.id, valor: neg ? -l.q : l.q, base: bases.find((b) => b.id === l.id).b, rateioSoma: soma }))
}

// Serialização canônica: chaves ordenadas, sem espaços.
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']'
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}'
  }
  return JSON.stringify(v)
}

const porId = (lista) => [...(lista ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

export function calcularLandedCost(input) {
  const hash = 'sha256:' + createHash('sha256').update(canonico(normalizarParaHash(input))).digest('hex')
  const divergencias = []
  const pendente = (codigo, referencia, mensagem) => divergencias.push({ codigo, severidade: 'BLOQUEANTE', referencia, mensagem })

  if (input.schema_version !== '1') erro('LANDED_SCHEMA_VERSAO')
  // P-02: arredondamento é literal aprovado (DECISÃO-06 v1). Outro modo exige nova versão.
  if (input.politica?.arredondamento !== 'HALF_UP') erro('LANDED_POLITICA_INVALIDA')
  if (input.processo?.moeda_base !== 'BRL') erro('LANDED_MOEDA_BASE')

  // Câmbios: taxa com 10 casas
  const cambio = new Map([['BRL', 10n ** 10n]])
  for (const c of porId(input.cambios)) {
    const taxa = lerDec(c.taxa, 10, `cambio.${c.moeda}.taxa`)
    if (taxa <= 0n) erro('LANDED_CAMBIO_INVALIDO', c.moeda)
    cambio.set(c.moeda, taxa)
  }
  const taxaDe = (moeda, campo) => {
    const t = cambio.get(moeda)
    if (t === undefined) erro('LANDED_CAMBIO_AUSENTE', campo)
    return t
  }

  // Itens
  const itens = porId(input.itens).map((it) => {
    const merc6 = lerDec(it.valor_mercadoria_moeda, 6, `item.${it.id}.valor_mercadoria_moeda`)
    if (merc6 < 0n) erro('LANDED_VALOR_NEGATIVO', it.id)
    const mercS10 = multiplicaS10(merc6, 6, taxaDe(it.moeda, it.id), 10)
    const qCom = lerDec(it.quantidade_comercial, 3, `item.${it.id}.quantidade_comercial`)
    if (qCom <= 0n) erro('LANDED_QTD_INVALIDA', it.id)
    const fator = lerDec(it.fator_para_estoque, 6, `item.${it.id}.fator_para_estoque`)
    if (fator <= 0n) erro('LANDED_FATOR_INVALIDO', it.id)
    const qEst = lerDec(it.quantidade_estoque, 3, `item.${it.id}.quantidade_estoque`)
    // qCom (3) × fator (6) = escala 9; qEst (3) reescalado para 9 precisa ser igual
    if (qCom * fator !== qEst * pow10(6)) erro('LANDED_QTD_FATOR_INCONSISTENTE', it.id)
    const valorAdu = it.valor_aduaneiro_brl == null
      ? null
      : reescala(lerDec(it.valor_aduaneiro_brl, 6, `item.${it.id}.valor_aduaneiro_brl`), 6, ESC_INTERMEDIARIA)
    return {
      id: it.id,
      produto_id: it.produto_id ?? null,
      mercS10,
      qEst,
      pesoLiq: lerDec(it.peso_liquido_kg, 3, `item.${it.id}.peso_liquido_kg`, { opcional: true }),
      pesoBruto: lerDec(it.peso_bruto_kg, 3, `item.${it.id}.peso_bruto_kg`, { opcional: true }),
      volume: lerDec(it.volume_m3, 3, `item.${it.id}.volume_m3`, { opcional: true }),
      valorAdu,
      acumuladoS10: mercS10,
      componentes: { mercadoria: mercS10, despesas: 0n, tributos: 0n, descontos: 0n },
    }
  })
  const itemPorId = new Map(itens.map((i) => [i.id, i]))
  const baseDoCriterio = (criterio, item, campo) => {
    switch (criterio) {
      case 'VALOR_ADUANEIRO':
        if (item.valorAdu === null) { pendente('VALOR_ADUANEIRO_AUSENTE', item.id, 'valor aduaneiro do item não informado'); return null }
        return item.valorAdu
      case 'PESO_LIQUIDO': if (item.pesoLiq === null) erro('LANDED_DADO_AUSENTE', campo); return item.pesoLiq
      case 'PESO_BRUTO': if (item.pesoBruto === null) erro('LANDED_DADO_AUSENTE', campo); return item.pesoBruto
      case 'VOLUME': if (item.volume === null) erro('LANDED_DADO_AUSENTE', campo); return item.volume
      case 'QUANTIDADE_ESTOQUE': return item.qEst
      default: erro('LANDED_CRITERIO_INVALIDO', campo)
    }
  }
  const exigeJustificativa = (obj, campo) => {
    if (typeof obj.justificativa !== 'string' || obj.justificativa.trim().length < 10) erro('LANDED_JUSTIFICATIVA_AUSENTE', campo)
  }

  // Despesas e descontos de processo (rateio ou direta)
  const rateios = []
  const aplicarValor = (itemId, valorS10, origem, componente) => {
    const item = itemPorId.get(itemId)
    if (!item) erro('LANDED_ITEM_INEXISTENTE', origem)
    item.acumuladoS10 += valorS10
    item.componentes[componente] += valorS10
  }
  const processarValor = (obj, origem, componente, sinal) => {
    const moeda = obj.moeda
    const valorS10 = multiplicaS10(lerDec(obj.valor, 6, `${origem}.valor`), 6, taxaDe(moeda, origem), 10) * sinal
    const at = obj.atribuicao ?? { modo: obj.escopo === 'ITEM' ? 'DIRETA' : 'RATEIO', item_id: obj.item_id, criterio: obj.criterio, justificativa: obj.justificativa }
    if (at.modo === 'DIRETA') {
      exigeJustificativa(at, origem)
      aplicarValor(at.item_id, valorS10, origem, componente)
      return
    }
    if (at.modo !== 'RATEIO') erro('LANDED_CRITERIO_INVALIDO', origem)
    if (!CRITERIOS.includes(at.criterio)) erro('LANDED_CRITERIO_INVALIDO', origem)
    exigeJustificativa(at, origem)
    const bases = []
    let faltou = false
    for (const it of itens) {
      const b = baseDoCriterio(at.criterio, it, origem)
      if (b === null) { faltou = true; continue }
      bases.push({ id: it.id, b })
    }
    if (faltou) return // divergência já registrada; despesa excluída
    for (const r of ratear(valorS10, bases)) {
      aplicarValor(r.id, r.valor, origem, componente)
      const escBase = at.criterio === 'VALOR_ADUANEIRO' ? 10 : 3
      rateios.push({ origem_id: obj.id, componente, criterio: at.criterio, base_total: fmt(r.rateioSoma, escBase), item_id: r.id, base_item: fmt(r.base, escBase), valor_alocado_brl: fmt(r.valor, 10), justificativa: at.justificativa })
    }
  }

  // Despesas: só entram se incorporavel === true. Pendente → divergência, excluída.
  const despesasNaoIncorporadas = []
  for (const d of porId(input.despesas)) {
    if (d.incorporavel === true) processarValor(d, `despesa.${d.id}`, 'despesas', 1n)
    else if (d.incorporavel === false) despesasNaoIncorporadas.push(d.id)
    else pendente('DECISAO_INCORPORAVEL_PENDENTE', d.id, 'incorporável ao custo não decidido (DECISÃO-03)')
  }
  for (const desc of porId(input.descontos)) {
    processarValor(desc, `desconto.${desc.id}`, 'descontos', -1n)
  }

  // Tributos
  for (const t of porId(input.tributos)) {
    if (t.status_recuperabilidade === 'PENDENTE_VALIDACAO') {
      pendente('TRIBUTO_PENDENTE', t.id, 'tributo sem status de recuperabilidade validado')
      continue
    }
    if (t.regra) {
      // P-01: regra com vigência; fato gerador fora da vigência → excluído com divergência
      if (!t.regra.vigencia_inicio || !t.data_fato_gerador) erro('LANDED_DADO_AUSENTE', `tributo.${t.id}.vigencia`)
      const fora = t.data_fato_gerador < t.regra.vigencia_inicio || (t.regra.vigencia_fim && t.data_fato_gerador > t.regra.vigencia_fim)
      if (fora) { pendente('TRIBUTO_REGRA_FORA_VIGENCIA', t.id, 'regra não vigente na data do fato gerador'); continue }
    }
    // Incorpora ao custo: NAO_RECUPERAVEL ou GLOSADO, quando a regra manda incorporar (doc 03 §3)
    if (['NAO_RECUPERAVEL', 'GLOSADO'].includes(t.status_recuperabilidade) && t.regra?.incorpora_custo === true) {
      if (!t.item_id) erro('LANDED_TRIBUTO_ALOCACAO_AUSENTE', t.id)
      const valorS10 = reescala(lerDec(t.valor_apurado_brl, 2, `tributo.${t.id}.valor_apurado_brl`), 2, ESC_INTERMEDIARIA)
      aplicarValor(t.item_id, valorS10, `tributo.${t.id}`, 'tributos')
    }
    // RECUPERAVEL_* e NAO_APLICAVEL não entram no custo (crédito fica para registro próprio)
  }

  // Saídas por item
  let entradasS10 = 0n
  let saidasS10 = 0n
  let descontosAbsS10 = 0n
  const itensSaida = itens.map((it) => {
    const T = it.acumuladoS10
    const qEst = it.qEst
    const unitario6 = arredonda(T, 10n * qEst) // (T/10^10) / (qEst/10^3) × 10^6 = T / (10 × qEst)
    const residuoUnitario10 = T - unitario6 * qEst * 10n
    const residuoTotal10 = T - arredonda(T, pow10(6)) * pow10(6)
    const despesasComp = it.componentes.despesas + it.componentes.tributos
    entradasS10 += it.componentes.mercadoria + despesasComp
    saidasS10 += T
    descontosAbsS10 += it.componentes.descontos < 0n ? -it.componentes.descontos : it.componentes.descontos
    if (T < 0n) erro('LANDED_CUSTO_NEGATIVO', it.id)
    return {
      item_id: it.id,
      produto_id: it.produto_id,
      quantidade_estoque: fmt(qEst, 3),
      componentes_brl: {
        mercadoria: fmt(reescala(it.componentes.mercadoria, 10, 4), 4),
        despesas_incorporadas: fmt(reescala(it.componentes.despesas, 10, 4), 4),
        tributos_nao_recuperaveis: fmt(reescala(it.componentes.tributos, 10, 4), 4),
        descontos: fmt(reescala(it.componentes.descontos, 10, 4), 4),
      },
      custo_total_brl: fmt(reescala(T, 10, 4), 4),
      custo_unitario_brl: fmt(unitario6, 6),
      residuo_unitario_brl: fmt(residuoUnitario10, 10),
      residuo_total_brl: fmt(residuoTotal10, 10),
    }
  })

  const conservacaoOk = entradasS10 - descontosAbsS10 === saidasS10
  if (!conservacaoOk) erro('LANDED_CONSERVACAO_FALHOU')

  const status = divergencias.some((d) => d.severidade === 'BLOQUEANTE') ? 'BLOQUEADO' : 'OK'
  return {
    schema_version: '1',
    engine_version: ENGINE_VERSION,
    input_hash: hash,
    status,
    divergencias,
    itens: itensSaida,
    rateios,
    despesas_nao_incorporadas: despesasNaoIncorporadas,
    conservacao: {
      entradas_brl: fmt(reescala(entradasS10, 10, 4), 4),
      descontos_brl: fmt(reescala(descontosAbsS10, 10, 4), 4),
      saidas_brl: fmt(reescala(saidasS10, 10, 4), 4),
      diferenca_brl: fmt(entradasS10 - descontosAbsS10 - saidasS10, 10),
      ok: conservacaoOk,
    },
  }
}

// Hash estável: ordena listas por id antes de serializar (determinismo de ordem de entrada).
function normalizarParaHash(input) {
  const copia = structuredClone(input)
  for (const k of ['cambios', 'itens', 'despesas', 'descontos', 'tributos']) {
    if (Array.isArray(copia[k])) copia[k] = porId(copia[k])
  }
  return copia
}

export function executarCaso(input) {
  try {
    return calcularLandedCost(input)
  } catch (e) {
    if (e instanceof LandedErro) return { status: 'ERRO_ENTRADA', erro: e.codigo, detalhe: e.detalhe }
    throw e
  }
}

// ---------- execução CLI ----------
const here = dirname(fileURLToPath(import.meta.url))
const casosDir = join(here, '..', 'casos')

function main() {
  const gerar = process.argv.includes('--gerar')
  const pastas = readdirSync(casosDir).filter((n) => existsSync(join(casosDir, n, 'input.json'))).sort()
  let falhas = 0
  for (const nome of pastas) {
    const input = JSON.parse(readFileSync(join(casosDir, nome, 'input.json'), 'utf8'))
    const saida = executarCaso(input)
    const texto = JSON.stringify(saida, null, 2) + '\n'
    const arq = join(casosDir, nome, 'expected.json')
    if (gerar) {
      writeFileSync(arq, texto)
      console.log(`GEROU  ${nome}  status=${saida.status ?? '-'} ${saida.erro ?? ''}`)
      continue
    }
    const esperado = existsSync(arq) ? readFileSync(arq, 'utf8') : null
    if (esperado === texto) console.log(`PASS   ${nome}  status=${saida.status ?? '-'} ${saida.erro ?? ''}`)
    else { falhas++; console.log(`FAIL   ${nome}`) }
  }
  console.log(gerar ? `\n${pastas.length} casos gravados.` : `\n${pastas.length - falhas}/${pastas.length} PASS`)
  if (!gerar && falhas > 0) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
