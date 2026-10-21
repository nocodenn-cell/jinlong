/**
 * Interface para interpretação de documentos (PDF/imagem) por IA — PREPARADA, DESLIGADA.
 *
 * Regras:
 *  - A IA só PROPÕE campos (mesmo formato da leitura de XML) e EXPLICA; cálculos são do motor.
 *  - Toda proposta exige conferência humana antes de gravar.
 *  - Desligada por padrão: `IMPORT_IA_HABILITADA=1` + provedor configurado no servidor.
 *    Nesta versão NÃO há provedor pago: só o `InterpretadorMock` (testes/demonstração).
 *  - Controle de custo: orçamento por empresa/dia (páginas) checado ANTES de chamar o provedor;
 *    processamento previsto como fila assíncrona (job por documento) quando houver provedor.
 */
import type { PropostaXml } from '../xml/lerXmlImportacao'

export type TipoDocumentoIa = 'INVOICE' | 'PACKING_LIST' | 'CONHECIMENTO_EMBARQUE' | 'DI' | 'DUIMP' | 'COMPROVANTE_PAGAMENTO' | 'OUTRO'

export type EntradaInterpretacao = {
  empresaId: string
  tipo: TipoDocumentoIa
  mime: 'application/pdf' | 'image/png' | 'image/jpeg'
  paginas: number
  /** Conteúdo NUNCA é logado. */
  conteudo: Uint8Array
}

export type ResultadoInterpretacao =
  | { ok: true; proposta: Omit<PropostaXml, 'tipo'> & { tipo: TipoDocumentoIa }; confianca: number; provedor: string; revisaoHumanaObrigatoria: true }
  | { ok: false; motivo: 'IA_DESABILITADA' | 'ORCAMENTO_EXCEDIDO' | 'TIPO_NAO_SUPORTADO' | 'FALHA_PROVEDOR' }

export interface InterpretadorDocumentos {
  readonly provedor: string
  interpretar(e: EntradaInterpretacao): Promise<ResultadoInterpretacao>
}

export type ConfigIa = { habilitada: boolean; maxPaginasPorDia: number }

export function configIa(env: Record<string, string | undefined> = process.env): ConfigIa {
  const max = Number.parseInt(env.IMPORT_IA_MAX_PAGINAS_DIA ?? '', 10)
  return { habilitada: env.IMPORT_IA_HABILITADA === '1', maxPaginasPorDia: Number.isFinite(max) && max > 0 ? max : 50 }
}

/** Orçamento de páginas por empresa/dia (contador injetável; em produção, persistido). */
export class OrcamentoIa {
  private readonly uso = new Map<string, number>()
  constructor(private readonly maxPorDia: number, private readonly hoje: () => string = () => new Date().toISOString().slice(0, 10)) {}
  reservar(empresaId: string, paginas: number): boolean {
    const k = `${empresaId}:${this.hoje()}`
    const atual = this.uso.get(k) ?? 0
    if (paginas <= 0 || atual + paginas > this.maxPorDia) return false
    this.uso.set(k, atual + paginas)
    return true
  }
}

/** Mock determinístico: devolve proposta vazia marcada para revisão. Sem rede, custo zero. */
export class InterpretadorMock implements InterpretadorDocumentos {
  readonly provedor = 'mock'
  async interpretar(e: EntradaInterpretacao): Promise<ResultadoInterpretacao> {
    return {
      ok: true, provedor: this.provedor, confianca: 0, revisaoHumanaObrigatoria: true,
      proposta: { tipo: e.tipo, numero: null, data_documento: null, itens: [], tributos: [], alertas: ['Proposta simulada (mock): preencha e confira manualmente'] },
    }
  }
}

/** Porta única: aplica flag e orçamento antes de qualquer provedor. */
export async function interpretarDocumento(
  e: EntradaInterpretacao,
  deps: { config: ConfigIa; orcamento: OrcamentoIa; interpretador: InterpretadorDocumentos },
): Promise<ResultadoInterpretacao> {
  if (!deps.config.habilitada) return { ok: false, motivo: 'IA_DESABILITADA' }
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(e.mime)) return { ok: false, motivo: 'TIPO_NAO_SUPORTADO' }
  if (!deps.orcamento.reservar(e.empresaId, e.paginas)) return { ok: false, motivo: 'ORCAMENTO_EXCEDIDO' }
  try {
    return await deps.interpretador.interpretar(e)
  } catch {
    return { ok: false, motivo: 'FALHA_PROVEDOR' }
  }
}
