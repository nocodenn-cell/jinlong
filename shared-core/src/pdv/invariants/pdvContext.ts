export const PDVContext = {
  DEMO_FLOW: 'DEMO_FLOW',
  CAIXA_CLOSE: 'CAIXA_CLOSE',
  TEST: 'TEST',
} as const

export type PDVContext = (typeof PDVContext)[keyof typeof PDVContext]
