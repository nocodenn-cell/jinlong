import { XMLParser } from 'fast-xml-parser'

/** Linha extraída do XML (antes do fator / conferência). */
export type NfeItemParsed = {
  produto_id?: string
  nome_produto: string
  /** GTIN (cEAN) como texto, zeros à esquerda preservados; "SEM GTIN" ou vazio → null. */
  gtin: string | null
  /** cProd como texto, exatamente como no XML (zeros à esquerda são significativos — D5). */
  ref_fornecedor: string
  ncm: string | null
  u_com: string | null
  q_com: number
  v_un_com: number
  /** Valores decimais como vieram no XML (sem passar por float). */
  q_com_texto?: string
  v_un_com_texto?: string
  /** cEANTrib (GTIN da unidade tributável), quando houver. */
  gtin_tributavel?: string | null
  /**
   * Compatibilidade (D5): referência e GTIN como o parser ANTERIOR os produzia (numérico,
   * sem zeros à esquerda). Só para localizar vínculos gravados antes da correção; nunca é gravada.
   */
  ref_fornecedor_legado?: string
  gtin_legado?: string | null
}

export type NfeEmitenteParsed = {
  nome: string
  cnpj: string
}

export type NfeDuplicataParsed = {
  numero: string | null
  data_vencimento: string  // YYYY-MM-DD
  valor: number
}

/** <cobr>/<fat>: fatura (valor original, desconto, líquido) — base da conciliação (D6). */
export type NfeFaturaParsed = {
  numero: string | null
  valor_original: string | null
  valor_desconto: string | null
  valor_liquido: string | null
}

/** <pag>/<detPag>: forma e indicador de pagamento (0 = à vista, 1 = a prazo). */
export type NfePagamentoParsed = {
  ind_pag: string | null
  t_pag: string | null
  valor: string | null
}

/** <total>/<ICMSTot> somente leitura, valores como texto. */
export type NfeTotaisParsed = Partial<
  Record<
    'vProd' | 'vFrete' | 'vSeg' | 'vDesc' | 'vII' | 'vIPI' | 'vOutro' | 'vNF' | 'vICMS' | 'vST' | 'vPIS' | 'vCOFINS',
    string
  >
>

export type NfeParsed = {
  origem_manual?: boolean
  chave_acesso: string
  numero_nf: string | null
  emitente: NfeEmitenteParsed
  itens: NfeItemParsed[]
  duplicatas: NfeDuplicataParsed[]
  fatura?: NfeFaturaParsed | null
  pagamentos?: NfePagamentoParsed[]
  totais?: NfeTotaisParsed
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : ''
}

function strOuNull(v: unknown): string | null {
  const s = str(v)
  return s === '' ? null : s
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

function normalizarGtin(raw: string): string | null {
  if (!raw || /^SEM\s*GTIN$/i.test(raw)) return null
  return raw
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/** Item 14: `<dup>` presente e malformada aborta — não pode ser descartada. */
function parseDuplicata(d: unknown): NfeDuplicataParsed {
  const dupRec = asRecord(d)
  if (!dupRec) {
    throw new Error('IMPORT_NFE_DUPLICATA_INVALIDA')
  }
  const rawData = str(dupRec.dVenc)
  const valorTexto = str(dupRec.vDup)
  const valor = num(valorTexto)
  if (!YMD_RE.test(rawData) || valor <= 0) {
    throw new Error('IMPORT_NFE_DUPLICATA_INVALIDA')
  }
  return {
    numero: str(dupRec.nDup) || null,
    data_vencimento: rawData,
    valor,
  }
}

function localizarInfNFe(root: unknown): { infNFe: Record<string, unknown>; nfeProc: Record<string, unknown> | null } {
  const rootRec = asRecord(root)
  if (!rootRec) throw new Error('XML vazio.')
  const nfeProc = asRecord(rootRec.nfeProc)
  const nfeWrapper = asRecord(nfeProc?.NFe) ?? asRecord(rootRec.NFe)
  const infNFeRaw = nfeWrapper?.infNFe ?? asRecord(rootRec.infNFe)
  const infNFe = asRecord(infNFeRaw)
  if (!infNFe) throw new Error('Não foi encontrado infNFe na NF-e.')
  return { infNFe, nfeProc }
}

/**
 * cProd/cEAN do parser ANTERIOR (parseTagValue: true), por item, na mesma ordem dos <det>.
 * Reproduz exatamente o que foi gravado em vínculos antigos, sem adivinhar regras.
 */
function referenciasLegadas(xml: string): { ref: string; gtin: string | null }[] {
  try {
    const legado = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,
      parseTagValue: true,
      trimValues: true,
    }).parse(xml) as unknown
    const { infNFe } = localizarInfNFe(legado)
    return asArray(infNFe.det).map((det) => {
      const prod = asRecord(asRecord(det)?.prod)
      return {
        ref: str(prod?.cProd),
        gtin: normalizarGtin(str(prod?.cEAN ?? prod?.cEANTrib ?? '')),
      }
    })
  } catch {
    return []
  }
}

/**
 * Parser tolerante a namespaces e estrutura nfeProc / NFe.
 * Todos os valores de tag são lidos como TEXTO (parseTagValue: false): códigos (cProd, cEAN,
 * cEANTrib, NCM, CNPJ, nNF, chave) preservam zeros à esquerda e dígitos; números decimais são
 * convertidos explicitamente só onde o fluxo legado espera number.
 */
export function parseNfeXml(xmlString: string): NfeParsed {
  const trimmed = xmlString.trim()
  if (!trimmed.includes('<')) {
    throw new Error('Arquivo não parece XML válido.')
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  })

  const { infNFe, nfeProc } = localizarInfNFe(parser.parse(trimmed) as unknown)

  let chave = ''
  const idAttr = infNFe['@_Id']
  if (typeof idAttr === 'string' && idAttr.length >= 44) {
    chave = idAttr.replace(/^NFe/i, '').trim()
  }
  if (chave.length !== 44) {
    const prot = asRecord(asRecord(nfeProc)?.protNFe)
    const infProt = asRecord(prot?.infProt)
    const chProt = str(infProt?.chNFe)
    if (chProt.length === 44) chave = chProt
  }
  if (chave.length !== 44) {
    throw new Error('Chave de acesso (44 dígitos) não encontrada no XML.')
  }

  const emit = asRecord(infNFe.emit)
  const cnpjEmit = onlyDigits(str(emit?.CNPJ ?? emit?.CPF ?? ''))
  const nomeEmit = str(emit?.xNome ?? emit?.xFant ?? '')
  if (cnpjEmit.length !== 14) {
    throw new Error('CNPJ do emitente inválido ou ausente no XML.')
  }

  const ide = asRecord(infNFe.ide)
  const numeroNf = strOuNull(ide?.nNF)

  const detBlocks = asArray(infNFe.det)
  const legados = referenciasLegadas(trimmed)

  const itens: NfeItemParsed[] = []
  detBlocks.forEach((det, idx) => {
    const detRec = asRecord(det)
    const prod = asRecord(detRec?.prod)
    if (!prod) return

    const refFornecedor = str(prod.cProd)
    if (!refFornecedor) return

    const gtin = normalizarGtin(str(prod.cEAN ?? prod.cEANTrib ?? ''))
    const nomeProd = str(prod.xProd) || refFornecedor
    const qTexto = str(prod.qCom)
    const vTexto = str(prod.vUnCom)
    const legado = legados[idx]

    itens.push({
      nome_produto: nomeProd,
      gtin,
      ref_fornecedor: refFornecedor,
      ncm: strOuNull(prod.NCM),
      u_com: strOuNull(prod.uCom),
      q_com: num(qTexto),
      v_un_com: num(vTexto),
      q_com_texto: qTexto,
      v_un_com_texto: vTexto,
      gtin_tributavel: normalizarGtin(str(prod.cEANTrib ?? '')),
      ref_fornecedor_legado: legado?.ref || refFornecedor,
      gtin_legado: legado ? legado.gtin : gtin,
    })
  })

  if (itens.length === 0) {
    throw new Error('Nenhum item (<det>/<prod>) encontrado na NF-e.')
  }

  // Duplicatas (contas a pagar) — seção <cobr>/<dup>.
  // `<cobr>/<fat>` sem `<dup>` (NF-e à vista) continua válido.
  // `<dup>` presente e malformada aborta: o continue silencioso deixava
  // confirmar_importacao_nfe creditar estoque sem a obrigação em contas_pagar
  // (#383 só cobria o swallow da RPC, depois do parser).
  const cobr = asRecord(infNFe.cobr)
  const duplicatas: NfeDuplicataParsed[] = cobr ? asArray(cobr.dup).map(parseDuplicata) : []

  const fat = asRecord(cobr?.fat)
  const fatura: NfeFaturaParsed | null = fat
    ? {
        numero: strOuNull(fat.nFat),
        valor_original: strOuNull(fat.vOrig),
        valor_desconto: strOuNull(fat.vDesc),
        valor_liquido: strOuNull(fat.vLiq),
      }
    : null

  const pag = asRecord(infNFe.pag)
  const pagamentos: NfePagamentoParsed[] = asArray(pag?.detPag).map((d) => {
    const r = asRecord(d)
    return { ind_pag: strOuNull(r?.indPag), t_pag: strOuNull(r?.tPag), valor: strOuNull(r?.vPag) }
  })

  const icmsTot = asRecord(asRecord(infNFe.total)?.ICMSTot)
  const totais: NfeTotaisParsed = {}
  if (icmsTot) {
    for (const k of ['vProd', 'vFrete', 'vSeg', 'vDesc', 'vII', 'vIPI', 'vOutro', 'vNF', 'vICMS', 'vST', 'vPIS', 'vCOFINS'] as const) {
      const v = strOuNull(icmsTot[k])
      if (v !== null) totais[k] = v
    }
  }

  return {
    chave_acesso: chave,
    numero_nf: numeroNf,
    emitente: { nome: nomeEmit || 'Emitente', cnpj: cnpjEmit },
    itens,
    duplicatas,
    fatura,
    pagamentos,
    totais,
  }
}
