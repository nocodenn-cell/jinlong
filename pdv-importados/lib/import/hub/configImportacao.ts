import 'server-only'
import type { AliquotaUf, ModalTransporte, TributoImportacao } from '@shared-core/src/import'
import type { ClienteImport } from '@/lib/import/importIntelligence'
import type { DadosCatalogoEmpresa } from './catalogoEmpresa'

/**
 * Leitura (RLS) da configuração nacional de importação da empresa. Tolerante: se as tabelas
 * ainda não existirem (migração não aplicada) ou houver erro, devolve null ⇒ catálogo de
 * demonstração, exatamente como antes. Números lidos como texto (nunca float).
 */
type Resp<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>
type Q<T> = Resp<T[]> & { eq: (c: string, v: string) => Q<T>; order: (c: string, o?: { ascending?: boolean }) => Q<T>; maybeSingle: () => Resp<T> }
type Leitor = { from: <T>(t: string) => { select: (c: string) => Q<T> } }

type LinhaUf = { uf: string; icms_modal_pct: string; fcp_geral_pct: string; vigencia_inicio: string; vigencia_fim: string | null; status: 'PESQUISADO' | 'VERIFICADO'; base_legal: string; nota: string | null }

const fmt4 = (v: string) => { const [i, f = ''] = v.split('.'); return `${i}.${(f + '0000').slice(0, 4)}` }

export async function carregarCatalogoEmpresa(client: ClienteImport, empresaId: string): Promise<DadosCatalogoEmpresa | null> {
  const c = client as unknown as Leitor
  try {
    const [cfg, ovr, tab] = await Promise.all([
      c.from<Record<string, string | null>>('empresa_parametros_importacao')
        .select('uf_importador,porto_padrao,modal_padrao,icms_efetivo_pct::text,regime_incentivo_nome,aviso_aceito_em')
        .eq('empresa_id', empresaId).maybeSingle(),
      c.from<{ id: string; tributo: TributoImportacao; ncm_prefixo: string; aliquota_pct: string; nota: string | null }>('empresa_tributos_override')
        .select('id,tributo,ncm_prefixo,aliquota_pct::text,nota').eq('empresa_id', empresaId).order('tributo'),
      c.from<LinhaUf>('tributos_catalogo_uf')
        .select('uf,icms_modal_pct::text,fcp_geral_pct::text,vigencia_inicio,vigencia_fim,status,base_legal,nota').order('uf'),
    ])
    if (cfg.error || ovr.error || tab.error) return null
    const hoje = new Date().toISOString().slice(0, 10)
    const tabela: AliquotaUf[] = (tab.data ?? [])
      .filter((l) => !l.vigencia_fim || l.vigencia_fim >= hoje)
      .map((l) => ({ uf: l.uf, icms_modal_pct: fmt4(l.icms_modal_pct), fcp_geral_pct: fmt4(l.fcp_geral_pct), vigencia_inicio: l.vigencia_inicio, base_legal: l.base_legal, status: l.status, nota: l.nota ?? '' }))
    const r = cfg.data
    return {
      config: r ? {
        uf_importador: String(r.uf_importador), porto_padrao: r.porto_padrao, modal_padrao: (r.modal_padrao as ModalTransporte | null) ?? null,
        icms_efetivo_pct: r.icms_efetivo_pct, regime_incentivo_nome: r.regime_incentivo_nome, aviso_aceito_em: r.aviso_aceito_em,
      } : null,
      overrides: (ovr.data ?? []).map((o) => ({ ...o, aliquota_pct: fmt4(o.aliquota_pct) })),
      tabela,
    }
  } catch {
    return null
  }
}
