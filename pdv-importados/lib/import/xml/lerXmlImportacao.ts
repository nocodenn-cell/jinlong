/**
 * Leitura de XML de importação (NF-e de entrada/importação e DI do Siscomex) para uma PROPOSTA.
 * - Determinística, sem rede, sem IA. Nada é gravado aqui: a proposta é conferida pelo usuário.
 * - Valores mantidos como TEXTO decimal (parseTagValue: false): sem ponto flutuante.
 * - DI (layout XML de extrato do Siscomex): valores numéricos vêm como inteiros com casas
 *   implícitas (moeda: 2 casas; quantidade: 5 casas; valor unitário: 7 casas). Quando o arquivo
 *   não segue esse padrão, a proposta registra alertas para conferência.
 */
import { XMLParser } from 'fast-xml-parser'

export type TipoXmlImportacao = 'NFE' | 'DI'

export type ItemProposto = {
  descricao: string
  codigo_fornecedor: string | null
  ncm: string | null
  quantidade: string
  unidade: string
  /** Valor total da mercadoria em BRL (NF-e: vProd; DI: valor da mercadoria na condição de venda em R$). */
  valor_brl: string
}

export type TributoProposto = {
  /** Índice do item na proposta (tributo por item). */
  item_indice: number
  tributo_codigo: 'II' | 'IPI' | 'PIS_IMPORTACAO' | 'COFINS_IMPORTACAO' | 'ICMS'
  valor_brl: string
}

export type PropostaXml = {
  tipo: TipoXmlImportacao
  numero: string | null
  data_documento: string | null
  itens: ItemProposto[]
  tributos: TributoProposto[]
  alertas: string[]
}

export class XmlImportacaoErro extends Error {}

const LIMITE_BYTES = 2_000_000
const LIMITE_ITENS = 500

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null)
const arr = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
const DEC = /^-?\d+(\.\d+)?$/

function decimalTexto(v: unknown): string | null {
  const s = txt(v).replace(',', '.')
  return DEC.test(s) ? s : null
}

/** Inteiro com `casas` implícitas → texto decimal ("000000000012345" , 2 → "123.45"). */
export function implicito(v: unknown, casas: number): string | null {
  const s = txt(v)
  if (!/^\d+$/.test(s)) return null
  const p = s.replace(/^0+(?=\d)/, '').padStart(casas + 1, '0')
  return casas === 0 ? p : `${p.slice(0, -casas)}.${p.slice(-casas)}`
}

function dataIso(v: unknown): string | null {
  const s = txt(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return null
}

const ncm8 = (v: unknown): string | null => {
  const d = txt(v).replace(/\D/g, '')
  return d.length === 8 ? d : null
}

function positivo(v: string | null): boolean {
  return v !== null && /[1-9]/.test(v) && !v.startsWith('-')
}

export function lerXmlImportacao(xml: string): PropostaXml {
  if (typeof xml !== 'string' || !xml.includes('<')) throw new XmlImportacaoErro('XML_INVALIDO')
  if (xml.length > LIMITE_BYTES) throw new XmlImportacaoErro('XML_GRANDE_DEMAIS')
  // Sem DTD/entidades externas (fast-xml-parser não resolve entidades externas; recusamos DOCTYPE).
  if (/<!DOCTYPE/i.test(xml)) throw new XmlImportacaoErro('XML_DOCTYPE_NAO_PERMITIDO')
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, trimValues: true })
  let raiz: Rec | null
  try {
    raiz = rec(parser.parse(xml))
  } catch {
    throw new XmlImportacaoErro('XML_INVALIDO')
  }
  if (!raiz) throw new XmlImportacaoErro('XML_INVALIDO')

  const infNFe = rec(rec(rec(raiz.nfeProc)?.NFe)?.infNFe) ?? rec(rec(raiz.NFe)?.infNFe)
  if (infNFe) return lerNfe(infNFe)
  const di = rec(rec(raiz.ListaDeclaracoes)?.declaracaoImportacao) ?? rec(raiz.declaracaoImportacao)
  if (di) return lerDi(di)
  throw new XmlImportacaoErro('XML_TIPO_NAO_RECONHECIDO')
}

function lerNfe(inf: Rec): PropostaXml {
  const ide = rec(inf.ide)
  const alertas: string[] = []
  const itens: ItemProposto[] = []
  const tributos: TributoProposto[] = []
  const dets = arr(inf.det as unknown[])
  if (dets.length > LIMITE_ITENS) throw new XmlImportacaoErro('XML_ITENS_DEMAIS')
  for (const d of dets) {
    const prod = rec(rec(d)?.prod)
    if (!prod) continue
    const q = decimalTexto(prod.qCom)
    const v = decimalTexto(prod.vProd)
    if (!positivo(q) || v === null) {
      alertas.push(`Item ${itens.length + 1}: quantidade ou valor ausente`)
      continue
    }
    const idx = itens.length
    itens.push({
      descricao: txt(prod.xProd) || `Item ${idx + 1}`,
      codigo_fornecedor: txt(prod.cProd) || null,
      ncm: ncm8(prod.NCM),
      quantidade: q!,
      unidade: txt(prod.uCom) || 'UN',
      valor_brl: v,
    })
    if (!ncm8(prod.NCM)) alertas.push(`Item ${idx + 1}: NCM ausente ou inválido`)
    const imp = rec(rec(d)?.imposto)
    const icmsGrupo = rec(imp?.ICMS)
    const icms = icmsGrupo ? rec(Object.values(icmsGrupo)[0]) : null
    const cand: Array<[TributoProposto['tributo_codigo'], unknown]> = [
      ['II', rec(imp?.II)?.vII],
      ['IPI', rec(rec(imp?.IPI)?.IPITrib)?.vIPI],
      ['PIS_IMPORTACAO', rec(rec(imp?.PIS)?.PISAliq)?.vPIS ?? rec(rec(imp?.PIS)?.PISOutr)?.vPIS],
      ['COFINS_IMPORTACAO', rec(rec(imp?.COFINS)?.COFINSAliq)?.vCOFINS ?? rec(rec(imp?.COFINS)?.COFINSOutr)?.vCOFINS],
      ['ICMS', icms?.vICMS],
    ]
    for (const [codigo, bruto] of cand) {
      const val = decimalTexto(bruto)
      if (val !== null && positivo(val)) tributos.push({ item_indice: idx, tributo_codigo: codigo, valor_brl: val })
    }
  }
  if (itens.length === 0) throw new XmlImportacaoErro('XML_SEM_ITENS')
  alertas.push('Conferir: na NF-e o valor do produto pode diferir do valor aduaneiro da DI/Duimp')
  return { tipo: 'NFE', numero: txt(ide?.nNF) || null, data_documento: dataIso(ide?.dhEmi ?? ide?.dEmi), itens, tributos, alertas }
}

function lerDi(di: Rec): PropostaXml {
  const alertas: string[] = []
  const itens: ItemProposto[] = []
  const tributos: TributoProposto[] = []
  const adicoes = arr(di.adicao as unknown[])
  for (const a0 of adicoes) {
    const a = rec(a0)
    if (!a) continue
    const ncm = ncm8(a.dadosMercadoriaCodigoNcm)
    const valorAdicao = implicito(a.condicaoVendaValorReais, 2)
    const mercs = arr(a.mercadoria as unknown[]).map(rec).filter((m): m is Rec => m !== null)
    if (itens.length + mercs.length > LIMITE_ITENS) throw new XmlImportacaoErro('XML_ITENS_DEMAIS')
    const primeiro = itens.length
    if (mercs.length === 0) {
      alertas.push(`Adição ${txt(a.numeroAdicao) || '?'}: sem mercadorias detalhadas`)
      continue
    }
    for (const m of mercs) {
      const q = implicito(m.quantidade, 5)
      const vu = implicito(m.valorUnitario, 7)
      if (!positivo(q)) {
        alertas.push(`Adição ${txt(a.numeroAdicao)}: quantidade ausente`)
        continue
      }
      itens.push({
        descricao: txt(m.descricaoMercadoria) || `Adição ${txt(a.numeroAdicao)}`,
        codigo_fornecedor: null,
        ncm,
        quantidade: q!,
        unidade: txt(m.unidadeMedida) || 'UN',
        // valor em R$ por item: proporcional ao total da adição quando houver vários itens; conferir
        valor_brl: mercs.length === 1 && valorAdicao ? valorAdicao : vu ?? '0',
      })
    }
    if (mercs.length > 1) alertas.push(`Adição ${txt(a.numeroAdicao)}: ${mercs.length} itens — valores por item vêm na moeda negociada (valorUnitario); converter/conferir`)
    if (!ncm) alertas.push(`Adição ${txt(a.numeroAdicao)}: NCM ausente`)
    // tributos da adição vinculados ao 1º item da adição (conferência humana decide o rateio)
    const cand: Array<[TributoProposto['tributo_codigo'], unknown]> = [
      ['II', a.iiAliquotaValorDevido],
      ['IPI', a.ipiAliquotaValorDevido],
      ['PIS_IMPORTACAO', a.pisPasepAliquotaValorDevido],
      ['COFINS_IMPORTACAO', a.cofinsAliquotaValorDevido],
    ]
    for (const [codigo, bruto] of cand) {
      const v = implicito(bruto, 2)
      if (v !== null && positivo(v) && itens.length > primeiro) tributos.push({ item_indice: primeiro, tributo_codigo: codigo, valor_brl: v })
    }
  }
  if (itens.length === 0) throw new XmlImportacaoErro('XML_SEM_ITENS')
  alertas.push('ICMS da importação não vem na DI: registre pelo comprovante/GARE ou pelo simulador')
  return { tipo: 'DI', numero: txt(di.numeroDI) || null, data_documento: dataIso(di.dataRegistro), itens, tributos, alertas }
}
