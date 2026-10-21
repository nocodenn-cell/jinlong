'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ROUTES } from '@/lib/navigation/routes'
import { actionImportacoes } from '@/lib/import/hub/gateImportacoes'
import { carregarOperacao } from '@/lib/import/hub/dadosImportacoes'
import { chaveErro } from '@/lib/import/hub/elegibilidade'
import { normalizarDecimal } from '@/lib/import/hub/decimais'
import { sugerirTributos, sugestaoParaLancamento } from '@/lib/import/hub/inteligencia'
import { carregarCatalogoEmpresa } from '@/lib/import/hub/configImportacao'
import { parametrosDaEmpresa } from '@/lib/import/hub/catalogoEmpresa'
import { XmlImportacaoErro, lerXmlImportacao, type PropostaXml } from '@/lib/import/xml/lerXmlImportacao'
import type { ResultadoAcao } from './actions'

/**
 * Inteligência do hub: leitura de XML (proposta → conferência → aplicação) e registro de
 * tributos sugeridos por NCM. Mesmo gate/RPCs do hub; nada toca estoque, financeiro, preços
 * oficiais ou emissão fiscal. Valores entram como PENDENTES de conferência humana.
 */

const Uuid = z.string().uuid()
const DataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Uf = z.string().regex(/^[A-Z]{2}$/)
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }

const falha = (erro: string, detalhe?: string) => ({ ok: false as const, erro, ...(detalhe ? { detalhe } : {}) })
function revalidar(op: string) {
  revalidatePath(ROUTES.admin.importacoes)
  revalidatePath(`${ROUTES.admin.importacoes}/${op}`)
}
async function rpc(client: unknown, fn: string, args: Record<string, unknown>) {
  const { data, error } = await (client as Rpc).rpc(fn, args)
  return error ? { ok: false as const, erro: chaveErro(error.message) } : { ok: true as const, data }
}

/** Remove zeros à direita da fração ("100.0000" → "100") antes de aplicar a escala do motor. */
const aparar = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v)

function ler(xml: string): PropostaXml | string {
  try {
    return lerXmlImportacao(xml)
  } catch (e) {
    return e instanceof XmlImportacaoErro ? `erro_${e.message.toLowerCase()}` : 'erro_xml_invalido'
  }
}

/** Só leitura: devolve a proposta para conferência (nada é gravado). */
export async function lerXmlAction(operacaoId: string, xml: string): Promise<ResultadoAcao<PropostaXml>> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  if (!Uuid.safeParse(operacaoId).success || typeof xml !== 'string') return falha('erro_valor_invalido')
  const p = ler(xml)
  return typeof p === 'string' ? falha(p) : { ok: true, data: p }
}

/**
 * Aplica a proposta CONFERIDA: o XML é relido no servidor (não confia na proposta do navegador),
 * registra a referência do documento, as mercadorias e os tributos (PENDENTE_VALIDACAO).
 */
export async function aplicarXmlAction(
  operacaoId: string, xml: string, incluir: { itens: number[]; tributos: boolean },
): Promise<ResultadoAcao<{ itens: number; tributos: number }>> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  if (!Uuid.safeParse(operacaoId).success || typeof xml !== 'string' || !Array.isArray(incluir?.itens)) return falha('erro_valor_invalido')
  const p = ler(xml)
  if (typeof p === 'string') return falha(p)
  const sel = new Set(incluir.itens.filter((n) => Number.isInteger(n) && n >= 0 && n < p.itens.length))
  if (sel.size === 0) return falha('erro_valor_invalido')
  const c = gate.ctx.client

  const doc = await rpc(c, 'import_registrar_documento', {
    p_operacao: operacaoId, p_tipo: p.tipo, p_numero: p.numero, p_data: p.data_documento,
    p_storage_path: null, p_sha256: null, p_tamanho: null, p_mime: null, p_substitui: null,
  })
  if (!doc.ok) return falha(doc.erro)
  const documentoId = String(doc.data)

  const idPorIndice = new Map<number, string>()
  for (const idx of [...sel].sort((a, b) => a - b)) {
    const it = p.itens[idx]
    const q = normalizarDecimal(aparar(it.quantidade), 3)
    const v = normalizarDecimal(aparar(it.valor_brl), 6)
    if (!q || !v) return falha('erro_valor_invalido', `item ${idx + 1}`)
    const r = await rpc(c, 'import_salvar_item', {
      p_operacao: operacaoId,
      p_item: {
        descricao: it.descricao.slice(0, 300), codigo_fornecedor: it.codigo_fornecedor, ncm: it.ncm, produto_id: null,
        moeda: 'BRL', valor_mercadoria_moeda: v, valor_aduaneiro_brl: v, quantidade_comercial: q,
        unidade_comercial: it.unidade.slice(0, 20), fator_para_estoque: '1', quantidade_estoque: q, documento_id: documentoId,
      },
    })
    if (!r.ok) return falha(r.erro, `item ${idx + 1}`)
    idPorIndice.set(idx, String(r.data))
  }

  let nTrib = 0
  if (incluir.tributos) {
    for (const t of p.tributos) {
      const itemId = idPorIndice.get(t.item_indice)
      if (!itemId) continue
      const valor = normalizarDecimal(aparar(t.valor_brl), 2)
      if (!valor) continue
      const r = await rpc(c, 'import_salvar_lancamento', {
        p_operacao: operacaoId, p_tipo: 'TRIBUTO',
        p_dados: { tributo_codigo: t.tributo_codigo, status_recuperabilidade: 'PENDENTE_VALIDACAO', valor_apurado_brl: valor,
          item_id: itemId, regra_id: null, regra_incorpora_custo: null, regra_vigencia_inicio: null, regra_vigencia_fim: null,
          data_fato_gerador: p.data_documento, validado_por: null, documento_id: documentoId },
      })
      if (!r.ok) return falha(r.erro, t.tributo_codigo)
      nTrib++
    }
  }
  revalidar(operacaoId)
  return { ok: true, data: { itens: idPorIndice.size, tributos: nTrib } }
}

/**
 * Registra as sugestões CALCULADAS (catálogo versionado, recalculado no servidor a partir dos
 * itens lidos sob RLS). Ficam pendentes de conferência; nenhuma alíquota vem do navegador.
 */
export async function registrarTributosSugeridosAction(
  operacaoId: string, input: { uf: string; data: string; chaves: string[] },
): Promise<ResultadoAcao<{ registrados: number }>> {
  const gate = await actionImportacoes()
  if (!gate.ok) return falha('erro_nao_autorizado')
  if (!Uuid.safeParse(operacaoId).success || !Uf.safeParse(input?.uf).success || !DataIso.safeParse(input?.data).success
    || !Array.isArray(input.chaves)) return falha('erro_valor_invalido')
  const dados = await carregarOperacao(gate.ctx.client, operacaoId)
  if (!dados) return falha('erro_nao_autorizado')
  // Mesmo catálogo da tela: sem configuração ⇒ demonstração (como antes); com ⇒ nacional + cliente.
  const cat = parametrosDaEmpresa(await carregarCatalogoEmpresa(gate.ctx.client, gate.ctx.empresaId), input.uf)
  const r = sugerirTributos(dados.itens, dados.cambios, input.uf, input.data, cat.parametros, cat.versao)
  const chaves = new Set(input.chaves)
  let n = 0
  for (const s of r.sugestoes) {
    if (s.status !== 'CALCULADO' || !chaves.has(`${s.item_id}:${s.tributo}`)) continue
    const x = await rpc(gate.ctx.client, 'import_salvar_lancamento', {
      p_operacao: operacaoId, p_tipo: 'TRIBUTO', p_dados: sugestaoParaLancamento(s, input.data),
    })
    if (!x.ok) return falha(x.erro, s.tributo)
    n++
  }
  revalidar(operacaoId)
  return { ok: true, data: { registrados: n } }
}
