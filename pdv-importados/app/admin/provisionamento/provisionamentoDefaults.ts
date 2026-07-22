/** Defaults de PDV para loja recém-provisionada (sem NFC-e obrigatória). */

export const PDV_CONFIG_DEFAULTS = {
  cfop_padrao: '5102',
  cst_padrao: '00',
  regime_tributario: 'SIMPLES_NACIONAL' as const,
  auto_enqueue_fiscal: false,
  tema_padrao: 'noturno' as const,
  imprimir_cupom_auto: true,
  formato_impressao: 'TERMICA' as const,
}

/** Itens do checklist marcados ao concluir o wizard. */
export const CHECKLIST_ITENS_POS_PROVISION: readonly string[] = [
  'loja.criada',
  'loja.pdv',
  'usuarios.dono',
]

export function slugCodigoLoja(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
  return base.length >= 2 ? base : `LOJA_${Date.now().toString(36).toUpperCase()}`
}
