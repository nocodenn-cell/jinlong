import type { HomeContent } from './types'

/** 中文版：草稿，等待母语审校。术语与 ERP 自身一致（完成销售、批发价、商品）。 */
export const homeZh: HomeContent = {
  meta: {
    title: '金龙 Jinlong · 零售与批发收银管理系统，中文和葡语',
    description: '面向巴西华人商家的收银与管理系统，支持中文和葡语。销售、库存和经营数据，一套系统全搞定。',
  },
  skipLink: '跳到主要内容',
  brandLabel: '金龙 Jinlong — 首页',
  nav: {
    label: '主导航',
    benefits: '功能优势',
    how: '如何开始',
    panel: '经营看板',
    login: '登录',
    cta: '试用15天',
    menuOpen: '打开菜单',
    menuClose: '关闭菜单',
  },
  langSwitch: { group: 'Idioma / 语言', pt: 'PT-BR', ptShort: 'PT', zh: '简体中文', zhShort: '中文' },
  hero: {
    badge: '中文和葡语收银系统',
    h1: { line1: '收银更简单，', line2: '门店尽在掌握。' },
    lead: '零售批发都能卖，库存清清楚楚，经营结果一目了然。一套支持中文和葡语的系统，专为站柜台的人设计。',
    ctaPrimary: '申请15天试用',
    ctaSecondary: '了解如何开始',
    microcopy: '试用需要申请，由我们的团队为您开通。',
  },
  mock: {
    items: [
      { name: '密封保鲜盒套装（3件）', sku: 'SKU: KIT-003 · 批发 10件起', price: 'R$ 185,00' },
      { name: '保温瓶 500 ml', sku: 'SKU: GAR-500', price: 'R$ 39,90' },
    ],
    totalLabel: '合计',
    total: 'R$ 224,90',
    finish: '完成销售',
    aria: '金龙收银台的销售示例（虚构数据）：2件商品，合计 224.90 雷亚尔。',
  },
  benefits: {
    title: '卖得更好，所需功能一应俱全',
    subtitle: '简单、快速，专为零售和批发门店打造',
    items: [
      { title: '快速收银', body: '开单、选择付款方式、完成销售，轻松不复杂。' },
      { title: '库存管理', body: '录入商品，每件商品还有多少一清二楚。' },
      { title: '零售与批发', body: '自行设定从多少件起按批发价。' },
      { title: '中文和葡语', body: '团队里每个人都用自己最熟悉的语言。' },
    ],
  },
  steps: {
    title: '三步开始销售',
    subtitle: '就这么简单，我们的团队全程指导。',
    items: [
      { title: '联系我们', body: '约定演示或15天试用。' },
      { title: '录入商品', body: '零售价、批发价、库存和付款方式。' },
      { title: '开始销售', body: '开班收银，用您的语言服务顾客。' },
    ],
  },
  panel: {
    title: '所有数据，一处掌握',
    subtitle: '随时了解门店经营情况。示例为虚构数据。',
    sample: '虚构数据',
    stats: [
      { label: '今日销售', value: 'R$ 2.450', note: '比昨天 +12%' },
      { label: '客单价', value: 'R$ 87,50', note: '28笔销售' },
      { label: '库存不足', value: '5', note: '件商品' },
    ],
    topTitle: '畅销商品',
    top: [
      { name: '保温瓶 500 ml', sales: '18笔销售', total: 'R$ 718,20' },
      { name: '密封保鲜盒套装（3件）', sales: '25笔销售', total: 'R$ 462,50' },
    ],
  },
  final: {
    title: '准备好卖得更多了吗？',
    lead: '预约演示，或申请15天试用，了解金龙。',
    cta: '申请15天试用',
    checks: ['15天试用', '中文和葡语', '零售与批发'],
  },
  contact: {
    whatsapp: '通过 WhatsApp 联系',
    emailLabel: '电子邮件',
    opensNewTab: '在新标签页打开',
  },
  footer: {
    tagline: '收银更简单，门店尽在掌握。',
    productTitle: '产品',
    companyTitle: '联系我们',
    legalTitle: '法律信息',
    privacy: '隐私政策',
    terms: '使用条款',
    login: '登录金龙',
    ptOnly: '（仅葡语）',
    rights: '版权所有。',
  },
  draftBanner: '中文版草稿：正在等待母语审校，暂不对外发布。',
}
