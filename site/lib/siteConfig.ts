/** Configuração comercial do site (um único lugar). */

/** 'demo' = "Agendar demonstração" (política atual). 'trial' = "Teste grátis por 7 dias". */
export const CTA_MODE: 'demo' | 'trial' = 'demo'

export const CTA_LABEL = {
  demo: { 'pt-BR': 'Agendar demonstração', 'zh-CN': '预约演示' },
  trial: { 'pt-BR': 'Teste grátis por 7 dias', 'zh-CN': '免费试用7天' },
} as const

/** Preços provisórios — ajustar aqui. */
export const PLANS = {
  provisional: true,
  items: [
    { id: 'essencial', name: { 'pt-BR': 'Essencial', 'zh-CN': '基础版' }, price: 149 },
    { id: 'importador', name: { 'pt-BR': 'Importador', 'zh-CN': '进口商版' }, price: 299 },
  ],
} as const

export const SEO_KEYWORDS = {
  'pt-BR': ['sistema PDV bilíngue', 'PDV em chinês', 'sistema para loja de importados'],
  'zh-CN': ['巴西收银系统', '中文收银系统', '巴西商店管理软件'],
} as const
