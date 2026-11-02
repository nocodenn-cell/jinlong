import { XMLParser } from 'fast-xml-parser'

/** Linha extraída do XML (antes do fator / conferência). */
export type NfeItemParsed = {
  produto_id?: string
  nome_produto: string
  /** GTIN (cEAN); pode ser "SEM GTIN" ou vazio → usar ref_fornecedor. */
  gtin: string | null
  ref_fornecedor: string
  ncm: string | null
  u_com: string | null
  q_com: number
  v_un_com: number
  /** vProd da NF-e (valor total do item, 2 casas). Ausente em entrada manual. */
  v_prod?: number | null
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

export type NfeParsed = {
  origem_manual?: boolean
  chave_acesso: string
  numero_nf: string | null
  emitente: NfeEmitenteParsed
  itens: NfeItemParsed[]
  duplicatas: NfeDuplicataParsed[]
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

function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/** Item 14: `<dup>` presente e malformada aborta — não pode ser descartada. */
function parseDuplicata(d: unknown): NfeDuplicataParsed {
  const dupRec = asRecord(d)
  if (!dupRec) {
    throw new Error('IMPORT_NFE_DUPLICATA_INVALIDA')
  }
  const rawData = str(dupRec.dVenc)
  const valor = num(dupRec.vDup)
  if (!YMD_RE.test(rawData) || valor <= 0) {
    throw new Error('IMPORT_NFE_DUPLICATA_INVALIDA')
  }
  return {
    numero: str(dupRec.nDup) || null,
    data_vencimento: rawData,
    valor,
  }
}

/**
 * Parser tolerante a namespaces e estrutura nfeProc / NFe.
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
    parseTagValue: true,
    trimValues: true,
  })

  const root = parser.parse(trimmed) as unknown
  const rootRec = asRecord(root)
  if (!rootRec) throw new Error('XML vazio.')

  const nfeProc = asRecord(rootRec.nfeProc)
  const nfeWrapper = asRecord(nfeProc?.NFe) ?? asRecord(rootRec.NFe)
  const infNFeRaw = nfeWrapper?.infNFe ?? asRecord(rootRec.infNFe)
  const infNFe = asRecord(infNFeRaw)
  if (!infNFe) throw new Error('Não foi encontrado infNFe na NF-e.')

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
  const numeroNf = ide?.nNF != null ? String(ide.nNF) : null

  const detBlocks = asArray(infNFe.det)

  const itens: NfeItemParsed[] = []
  for (const det of detBlocks) {
    const detRec = asRecord(det)
    const prod = asRecord(detRec?.prod)
    if (!prod) continue

    const refFornecedor = str(prod.cProd)
    if (!refFornecedor) continue

    let gtinRaw = str(prod.cEAN ?? prod.cEANTrib ?? '')
    if (!gtinRaw || /^SEM\s*GTIN$/i.test(gtinRaw)) gtinRaw = ''

    const nomeProd = str(prod.xProd) || refFornecedor

    const item: NfeItemParsed = {
      nome_produto: nomeProd,
      gtin: gtinRaw.length >= 8 ? gtinRaw : gtinRaw.length > 0 ? gtinRaw : null,
      ref_fornecedor: refFornecedor,
      ncm: str(prod.NCM) || null,
      u_com: str(prod.uCom) || null,
      q_com: num(prod.qCom),
      v_un_com: num(prod.vUnCom),
      v_prod: prod.vProd != null ? num(prod.vProd) : null,
    }
    itens.push(item)
  }

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

  return {
    chave_acesso: chave,
    numero_nf: numeroNf,
    emitente: { nome: nomeEmit || 'Emitente', cnpj: cnpjEmit },
    itens,
    duplicatas,
  }
}
