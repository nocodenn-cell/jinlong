import { XMLParser } from 'fast-xml-parser'
import { type NfeParsed, type NfeItemParsed } from './nfeParser'

// ─── Extended item type ───────────────────────────────────────────────────────

export type NfeItemFiscal = NfeItemParsed & {
  v_prod: number   // vProd = qCom × vUnCom
  v_icms: number   // valor total de ICMS do item
  v_ipi: number    // valor total de IPI do item
  v_st: number     // valor total de ICMS ST do item
}

// ─── Totais ICMSTot ───────────────────────────────────────────────────────────

export type NfeTotais = {
  v_nf: number       // valor total da NF-e
  v_produtos: number // vProd total
  v_frete: number    // vFrete
  v_icms: number     // vICMS
  v_ipi: number      // vIPI
  v_st: number       // vST (ICMS Substituição Tributária)
  v_desconto: number // vDesc
}

// ─── Duplicata (cobr/dup) ─────────────────────────────────────────────────────

export type NfeDuplicata = {
  numero: string | null    // nDup
  vencimento: string       // dVenc como ISO date (YYYY-MM-DD)
  valor: number            // vDup
}

// ─── Full fiscal payload ──────────────────────────────────────────────────────

export type NfeParsedFiscal = Omit<NfeParsed, 'itens'> & {
  serie: string | null
  data_emissao: string | null  // ISO date YYYY-MM-DD
  itens: NfeItemFiscal[]
  totais: NfeTotais
  duplicatas: NfeDuplicata[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
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

/** Normalises a date string from the XML (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ). */
function isoDate(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

// ─── ICMSTot extractor ────────────────────────────────────────────────────────

function extractTotais(infNFe: Record<string, unknown>): NfeTotais {
  const total = asRecord(asRecord(infNFe.total)?.ICMSTot) ?? {}
  return {
    v_nf:       num(total.vNF),
    v_produtos: num(total.vProd),
    v_frete:    num(total.vFrete),
    v_icms:     num(total.vICMS),
    v_ipi:      num(total.vIPI),
    v_st:       num(total.vST),
    v_desconto: num(total.vDesc),
  }
}

// ─── Imposto extractor (per det block) ───────────────────────────────────────

function extractItemImpostos(det: Record<string, unknown>): { v_icms: number; v_ipi: number; v_st: number } {
  const imposto = asRecord(det.imposto)

  // ICMS: pode estar em ICMS00..70 ou ICMSPart, ICMSSt, ICMSSN…
  let v_icms = 0
  const icmsGroup = asRecord(imposto?.ICMS)
  if (icmsGroup) {
    for (const key of Object.keys(icmsGroup)) {
      const sub = asRecord(icmsGroup[key])
      if (sub) {
        const candidate = num(sub.vICMS ?? sub.vICMSUFDest ?? 0)
        v_icms = Math.max(v_icms, candidate)
      }
    }
  }

  // IPI
  let v_ipi = 0
  const ipiGroup = asRecord(imposto?.IPI)
  if (ipiGroup) {
    const ipiTrib = asRecord(ipiGroup.IPITrib)
    const ipiNT   = asRecord(ipiGroup.IPINT)
    v_ipi = num(ipiTrib?.vIPI ?? ipiNT?.vIPI ?? 0)
  }

  // ICMS ST (vICMSST dentro do grupo ICMS, ou PIS/COFINS raramente)
  let v_st = 0
  if (icmsGroup) {
    for (const key of Object.keys(icmsGroup)) {
      const sub = asRecord(icmsGroup[key])
      if (sub) {
        const stCandidate = num(sub.vICMSST ?? 0)
        v_st = Math.max(v_st, stCandidate)
      }
    }
  }

  return { v_icms, v_ipi, v_st }
}

// ─── Duplicatas extractor ─────────────────────────────────────────────────────

function extractDuplicatas(infNFe: Record<string, unknown>): NfeDuplicata[] {
  const cobr = asRecord(infNFe.cobr)
  if (!cobr) return []

  const fat = asRecord(cobr.fat)
  const dupBlocks = asArray(cobr.dup)

  if (dupBlocks.length > 0) {
    return dupBlocks
      .map((d) => {
        const rec = asRecord(d)
        if (!rec) return null
        return {
          numero:     NULLIF(str(rec.nDup)),
          vencimento: str(rec.dVenc) || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          valor:      num(rec.vDup),
        } satisfies NfeDuplicata
      })
      .filter((d): d is NfeDuplicata => d !== null && d.valor > 0)
  }

  // Sem dup: tentar faturas (fat) como parcela única
  if (fat) {
    const valor = num(fat.vLiq ?? fat.vOrig ?? 0)
    const venc  = str(fat.dVenc)
    if (valor > 0) {
      return [{
        numero:     NULLIF(str(fat.nFat)),
        vencimento: venc || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        valor,
      }]
    }
  }

  return []
}

function NULLIF(s: string): string | null {
  return s || null
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Extensão fiscal do parseNfeXml: extrai impostos por item, totais ICMSTot,
 * série, data de emissão e duplicatas (cobr/dup) para ingestão completa.
 */
export function parseNfeXmlFiscal(xmlString: string): NfeParsedFiscal {
  const trimmed = xmlString.trim()
  if (!trimmed.includes('<')) {
    throw new Error('Arquivo não parece XML válido.')
  }

  const parser = new XMLParser({
    ignoreAttributes:   false,
    attributeNamePrefix: '@_',
    removeNSPrefix:     true,
    parseTagValue:      true,
    trimValues:         true,
  })

  const root    = parser.parse(trimmed) as unknown
  const rootRec = asRecord(root)
  if (!rootRec) throw new Error('XML vazio.')

  const nfeProc   = asRecord(rootRec.nfeProc)
  const nfeWrapper = asRecord(nfeProc?.NFe) ?? asRecord(rootRec.NFe)
  const infNFeRaw  = nfeWrapper?.infNFe ?? asRecord(rootRec.infNFe)
  const infNFe     = asRecord(infNFeRaw)
  if (!infNFe) throw new Error('Não foi encontrado infNFe na NF-e.')

  // Chave de acesso
  let chave = ''
  const idAttr = infNFe['@_Id']
  if (typeof idAttr === 'string' && idAttr.length >= 44) {
    chave = idAttr.replace(/^NFe/i, '').trim()
  }
  if (chave.length !== 44) {
    const prot    = asRecord(asRecord(nfeProc)?.protNFe)
    const infProt = asRecord(prot?.infProt)
    const chProt  = str(infProt?.chNFe)
    if (chProt.length === 44) chave = chProt
  }
  if (chave.length !== 44) {
    throw new Error('Chave de acesso (44 dígitos) não encontrada no XML.')
  }

  // Emitente
  const emit     = asRecord(infNFe.emit)
  const cnpjEmit = onlyDigits(str(emit?.CNPJ ?? emit?.CPF ?? ''))
  const nomeEmit = str(emit?.xNome ?? emit?.xFant ?? '')
  if (cnpjEmit.length !== 14) {
    throw new Error('CNPJ do emitente inválido ou ausente no XML.')
  }

  // IDE
  const ide      = asRecord(infNFe.ide)
  const numeroNf = ide?.nNF != null ? String(ide.nNF) : null
  const serie    = ide?.serie != null ? String(ide.serie) : null
  const dataEmissao = isoDate(ide?.dhEmi ?? ide?.dEmi)

  // Itens (det)
  const detBlocks = asArray(infNFe.det)
  if (detBlocks.length === 0) {
    throw new Error('Nenhum item (<det>/<prod>) encontrado na NF-e.')
  }

  const itens: NfeItemFiscal[] = []
  for (const det of detBlocks) {
    const detRec = asRecord(det)
    const prod   = asRecord(detRec?.prod)
    if (!prod) continue

    const refFornecedor = str(prod.cProd)
    if (!refFornecedor) continue

    let gtinRaw = str(prod.cEAN ?? prod.cEANTrib ?? '')
    if (!gtinRaw || /^SEM\s*GTIN$/i.test(gtinRaw)) gtinRaw = ''

    const qCom  = num(prod.qCom)
    const vUnCom = num(prod.vUnCom)
    const vProd  = num(prod.vProd) || qCom * vUnCom

    const { v_icms, v_ipi, v_st } = extractItemImpostos(detRec ?? {})

    itens.push({
      nome_produto:    str(prod.xProd) || refFornecedor,
      gtin:            gtinRaw.length >= 8 ? gtinRaw : gtinRaw.length > 0 ? gtinRaw : null,
      ref_fornecedor:  refFornecedor,
      ncm:             str(prod.NCM) || null,
      u_com:           str(prod.uCom) || null,
      q_com:           qCom,
      v_un_com:        vUnCom,
      v_prod:          vProd,
      v_icms,
      v_ipi,
      v_st,
    })
  }

  if (itens.length === 0) {
    throw new Error('Nenhum item válido extraído da NF-e.')
  }

  return {
    chave_acesso:  chave,
    numero_nf:     numeroNf,
    serie,
    data_emissao:  dataEmissao,
    emitente:      { nome: nomeEmit || 'Emitente', cnpj: cnpjEmit },
    itens,
    totais:        extractTotais(infNFe),
    duplicatas:    extractDuplicatas(infNFe),
  }
}
