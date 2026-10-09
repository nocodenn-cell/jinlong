import type { LanguageSample } from './types'

/**
 * Painéis comparativos do PDV (idêntico nas duas páginas).
 * Termos em chinês alinhados ao próprio ERP (`zh.json`): 完成销售, 批发价, 商品, 数量.
 * "收银台 · 新建销售" e "合计" são rascunho: revisão nativa pendente.
 */
export const PT_SAMPLE: LanguageSample = {
  code: 'PT-BR',
  name: 'Português (Brasil)',
  title: 'PDV · Nova venda',
  rows: [
    ['Produto', 'Kit pote hermético'],
    ['Quantidade', '12'],
    ['Preço de atacado', 'R$ 18,50'],
  ],
  total: ['Total', 'R$ 222,00'],
  button: 'Finalizar venda',
}

export const ZH_SAMPLE: LanguageSample = {
  code: 'ZH-CN',
  name: '简体中文',
  title: '收银台 · 新建销售',
  rows: [
    ['商品', '密封保鲜盒套装'],
    ['数量', '12'],
    ['批发价', 'R$ 18,50'],
  ],
  total: ['合计', 'R$ 222,00'],
  button: '完成销售',
}
