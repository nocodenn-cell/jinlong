import type { HomeContent } from './types'

/**
 * RASCUNHO preparado com IA. Publicação em produção condicionada à revisão
 * de falante nativo com conhecimento do comércio brasileiro
 * (ver NEXT_PUBLIC_SITE_ZH_REVIEWED em lib/site/publication.ts).
 */
export const homeZh: HomeContent = {
  meta: {
    title: '金龙 Jinlong · 进口商品店的收银与库存系统',
    description:
      '专为进口商品店打造的收银与库存系统：零售价与批发价自动区分，库存随销售更新，员工可使用中文或葡萄牙语。',
  },
  nav: {
    features: '功能',
    demo: '演示',
    journey: '如何开始',
    contact: '联系我们',
    login: '登录',
    menuLabel: '页面栏目',
  },
  hero: {
    eyebrow: '进口商品店的收银与库存系统',
    title: '每一笔销售价格准确，每一件货品库存清晰。',
    lead: '金龙自动区分零售价与批发价，每笔销售自动扣减库存，并完成收银对账。员工可使用中文或葡萄牙语，同一套操作。',
    ctaPrimary: '了解运作方式',
    ctaSecondary: '联系我们',
    proof: ['零售批发自动计价', '库存有迹可查', '中文与葡语'],
  },
  preview: {
    sample: '示例数据',
    sale: '销售示例',
    qty: '数量',
    decrease: '减少数量：',
    increase: '增加数量：',
    atacado: '批发价',
    varejo: '零售价',
    total: '合计',
    payment: '付款方式',
    methods: ['Pix', '现金', '刷卡'],
    hint: '试一试：把任意商品加到 6 件，批发价会自动生效。',
  },
  features: {
    eyebrow: '金龙能做什么',
    title: '从柜台到收银对账',
    items: [
      {
        title: '零售批发，无需计算器',
        body: '数量达到起批量时，批发价自动生效。柜台不再依靠心算，减少报错价。',
        note: '收银',
      },
      {
        title: '库存随销售自动更新',
        body: '每笔销售自动扣减库存，并记入库存流水，入库、出库、调整都有记录。',
        note: '库存',
      },
      {
        title: '部分付款自动记为应收账款',
        body: '顾客只付一部分时，余款记为应收账款，并关联到该顾客的档案。',
        note: '财务',
      },
      {
        title: '条形码标签',
        body: '录入商品后即可生成并打印标签，同一个条码可直接在收银台扫描。',
        note: '商品目录',
      },
      {
        title: '每个人用自己的语言',
        body: '说中文的员工和说葡萄牙语的员工使用同一套系统，各用各的语言。',
        note: '中文 · PT',
      },
    ],
  },
  journey: {
    eyebrow: '如何开始',
    title: '从第一次沟通到店铺上线',
    lead: '无需填表，没有压力：直接通过微信或 WhatsApp 联系我们。',
    steps: [
      {
        title: '免费演示',
        body: '用示例数据为您演示金龙的实际运作，节奏由您的店铺决定。',
      },
      {
        title: '15 天试用',
        body: '我们为您准备试用店铺，并与您一起跟进使用情况。',
      },
      {
        title: '订阅',
        body: '如果适合您的生意，就继续使用；如果不适合，也没有任何损失。',
      },
    ],
  },
  contact: {
    eyebrow: '联系我们',
    title: '聊聊您的店铺',
    lead: '告诉我们您卖什么、现在的柜台怎么运作。我们可以用中文或葡萄牙语回复。',
    unavailable: '联系方式即将公布。',
    channels: {
      whatsapp: '通过 WhatsApp 联系',
      wechat: '添加微信',
      wechatIdLabel: '微信号',
      open: '在新标签页打开',
    },
  },
  footer: {
    rights: '© Jinlong。保留所有权利。',
    privacy: '隐私政策',
    terms: '服务条款',
    ptOnly: '（仅葡语）',
  },
  locale: {
    switchLabel: '页面语言',
    other: 'Português',
    draftBanner: '中文版草稿：正在等待母语审校，暂不对外发布。',
  },
}
