/**
 * Fase 0 — Layout Compiler: tema único claro ("cara de Bling").
 * O antigo 'dragon-dark' foi aposentado; resta apenas a variante clara.
 *
 * Fase 1: o tipo passa a viver no contrato central (lib/theme/contract.ts).
 * Reexportado aqui por compatibilidade — os nomes de tema válidos existem
 * apenas no contrato.
 */
export type { GerenteUiTheme } from '@/lib/theme/contract'
