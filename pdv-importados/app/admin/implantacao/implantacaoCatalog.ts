/**
 * Catálogo canônico do checklist de implantação (gate GO-LIVE).
 * Chaves estáveis — i18n e DB referenciam `item_key`.
 */

export type ImplantacaoSecao =
  | 'ambiente'
  | 'loja'
  | 'usuarios'
  | 'cadastro'
  | 'operacao'
  | 'financeiro'
  | 'fiscal'
  | 'homologacao'

export type ImplantacaoItemDef = {
  key: string
  secao: ImplantacaoSecao
  /** Bloqueia autorização de GO-LIVE se não CONCLUIDO (exceto grupos). */
  obrigatorio: boolean
  /**
   * Grupo XOR: pelo menos um item do grupo deve estar CONCLUIDO.
   * Ex.: fiscal.stub | fiscal.nfce
   */
  grupo?: string
}

export const IMPLANTACAO_SECOES: readonly ImplantacaoSecao[] = [
  'ambiente',
  'loja',
  'usuarios',
  'cadastro',
  'operacao',
  'financeiro',
  'fiscal',
  'homologacao',
] as const

export const IMPLANTACAO_ITENS: readonly ImplantacaoItemDef[] = [
  { key: 'ambiente.url', secao: 'ambiente', obrigatorio: true },
  { key: 'ambiente.vars', secao: 'ambiente', obrigatorio: true },
  { key: 'ambiente.service_role', secao: 'ambiente', obrigatorio: true },
  { key: 'ambiente.storage', secao: 'ambiente', obrigatorio: true },
  { key: 'ambiente.backup', secao: 'ambiente', obrigatorio: false },

  { key: 'loja.criada', secao: 'loja', obrigatorio: true },
  { key: 'loja.config', secao: 'loja', obrigatorio: true },
  { key: 'loja.pdv', secao: 'loja', obrigatorio: true },
  { key: 'loja.impressora', secao: 'loja', obrigatorio: false },

  { key: 'usuarios.dono', secao: 'usuarios', obrigatorio: true },
  { key: 'usuarios.gerente', secao: 'usuarios', obrigatorio: true },
  { key: 'usuarios.operadores', secao: 'usuarios', obrigatorio: true },
  { key: 'usuarios.login', secao: 'usuarios', obrigatorio: true },
  { key: 'usuarios.recuperacao_senha', secao: 'usuarios', obrigatorio: true },

  { key: 'cadastro.categorias', secao: 'cadastro', obrigatorio: true },
  { key: 'cadastro.produtos', secao: 'cadastro', obrigatorio: true },
  { key: 'cadastro.clientes', secao: 'cadastro', obrigatorio: true },
  { key: 'cadastro.fornecedores', secao: 'cadastro', obrigatorio: true },

  { key: 'operacao.abrir_caixa', secao: 'operacao', obrigatorio: true },
  { key: 'operacao.venda', secao: 'operacao', obrigatorio: true },
  { key: 'operacao.desconto', secao: 'operacao', obrigatorio: true },
  { key: 'operacao.cancelamento', secao: 'operacao', obrigatorio: true },
  { key: 'operacao.sangria', secao: 'operacao', obrigatorio: true },
  { key: 'operacao.suprimento', secao: 'operacao', obrigatorio: true },
  { key: 'operacao.fechar_caixa', secao: 'operacao', obrigatorio: true },

  { key: 'financeiro.recebimento', secao: 'financeiro', obrigatorio: true },
  { key: 'financeiro.contas_pagar', secao: 'financeiro', obrigatorio: true },
  { key: 'financeiro.dashboard', secao: 'financeiro', obrigatorio: true },

  { key: 'fiscal.stub', secao: 'fiscal', obrigatorio: false, grupo: 'fiscal' },
  { key: 'fiscal.nfce', secao: 'fiscal', obrigatorio: false, grupo: 'fiscal' },

  /** P0-DADOS — gate antes das provas de venda / homologação integrada. */
  { key: 'homologacao.dados', secao: 'homologacao', obrigatorio: true },
  { key: 'homologacao.fluxo_completo', secao: 'homologacao', obrigatorio: true },
  { key: 'homologacao.cliente_treinado', secao: 'homologacao', obrigatorio: true },
  { key: 'homologacao.aceite', secao: 'homologacao', obrigatorio: true },
] as const

export type ItemStatus = 'PENDENTE' | 'CONCLUIDO' | 'NA'
export type GateStatus = 'NAO_PRONTO' | 'PRONTO_PENDENCIAS' | 'GO_LIVE'

export function itemDefByKey(key: string): ImplantacaoItemDef | undefined {
  return IMPLANTACAO_ITENS.find((i) => i.key === key)
}

/** Itens obrigatórios individuais + grupos XOR satisfeitos. */
export function avaliarBloqueiosGo(statusPorKey: Record<string, ItemStatus>): string[] {
  const bloqueios: string[] = []

  for (const item of IMPLANTACAO_ITENS) {
    if (item.grupo) continue
    if (!item.obrigatorio) continue
    if (statusPorKey[item.key] !== 'CONCLUIDO') {
      bloqueios.push(item.key)
    }
  }

  const grupos = new Set(
    IMPLANTACAO_ITENS.map((i) => i.grupo).filter((g): g is string => Boolean(g)),
  )
  for (const grupo of grupos) {
    const membros = IMPLANTACAO_ITENS.filter((i) => i.grupo === grupo)
    const ok = membros.some((m) => statusPorKey[m.key] === 'CONCLUIDO')
    if (!ok) bloqueios.push(`grupo:${grupo}`)
  }

  return bloqueios
}

export function calcularGateStatus(
  goAutorizado: boolean,
  statusPorKey: Record<string, ItemStatus>,
): GateStatus {
  if (goAutorizado) return 'GO_LIVE'
  const bloqueios = avaliarBloqueiosGo(statusPorKey)
  if (bloqueios.length > 0) return 'NAO_PRONTO'

  const opcionalPendente = IMPLANTACAO_ITENS.some(
    (i) => !i.obrigatorio && !i.grupo && statusPorKey[i.key] !== 'CONCLUIDO' && statusPorKey[i.key] !== 'NA',
  )
  if (opcionalPendente) return 'PRONTO_PENDENCIAS'
  return 'PRONTO_PENDENCIAS'
}
