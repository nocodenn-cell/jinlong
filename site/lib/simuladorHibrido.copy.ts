import type { SiteLocale } from './locales'

export interface SimuladorCopy {
  metaTitle: string
  metaDescription: string
  eyebrow: string
  title: string
  lead: string
  deadline: string
  disclaimer: string
  inputs: { faturamento: string; rbt12: string; rbt12Hint: string; b2b: string; b2bHint: string; compras: string; comprasHint: string; anexo: string; anexoValue: string; cbs: string; cbsHint: string }
  table: { head: string; puro: string; hibrido: string; das: string; porFora: string; total: string; credito: string; faixa: string; efetiva: string }
  rec: { puro: string; hibrido: string; avaliar: string; fora: string }
  extra: string
  saldo: string
  ctaTitle: string
  ctaLead: string
  cta: string
  back: string
  sourcesTitle: string
  sourceStatus: { oficial: string; secundaria: string; hipotese: string }
  privacy: string
}

const pt: SimuladorCopy = {
  metaTitle: 'Simulador Simples puro x Simples híbrido (IBS/CBS 2027) | Jinlong',
  metaDescription:
    'Atacadista no Simples Nacional: compare o custo de IBS e CBS dentro do DAS ou por fora (regime híbrido) e o crédito que seus clientes recebem. Prazo da opção para o 1º semestre de 2027 encerrado em 30/10/2026; cancelamento possível até 20/12/2026.',
  eyebrow: 'Reforma Tributária 2027',
  title: 'Simples puro ou Simples híbrido?',
  lead: 'Se você vende no atacado para empresas, o seu cliente vai olhar quanto crédito de IBS e CBS a sua nota dá a partir de 2027. Compare as duas opções em segundos.',
  deadline: 'O prazo para escolher o regime híbrido no 1º semestre de 2027 encerrou em 30/10/2026. Cancelamento possível de 03/11 a 20/12/2026; depois, novas janelas em março e setembro.',
  disclaimer: 'Estimativa — confirme com seu contador. Considera só o Anexo I (comércio) e a alíquota da CBS 2027 ainda não oficial.',
  inputs: {
    faturamento: 'Faturamento médio por mês (R$)',
    rbt12: 'Receita dos últimos 12 meses (R$, opcional)',
    rbt12Hint: 'Em branco, usamos faturamento × 12.',
    b2b: 'Vendas para empresas que tomam crédito (%)',
    b2bHint: 'Atacado para lojas e empresas do regime regular. O restante é varejo para consumidor final.',
    compras: 'Compras por mês com IBS/CBS que dão crédito (R$)',
    comprasHint: 'Compras de fornecedores do regime regular, importações etc.',
    anexo: 'Anexo do Simples',
    anexoValue: 'Anexo I — Comércio',
    cbs: 'Alíquota CBS + IBS em 2027 (%)',
    cbsHint: 'Hipótese: 8,8% de CBS + 0,1% de IBS. A CBS oficial sai até 15/12/2026.',
  },
  table: { head: 'Por mês (estimativa)', puro: 'Simples puro', hibrido: 'Simples híbrido', das: 'DAS', porFora: 'IBS/CBS por fora', total: 'Custo total', credito: 'Crédito para seus clientes', faixa: 'Faixa', efetiva: 'Alíquota efetiva' },
  rec: {
    puro: 'Pelos números informados, o Simples puro tende a custar menos e o ganho de crédito dos seus clientes não compensa. Leve esta simulação ao seu contador.',
    hibrido: 'Pelos números informados, o híbrido não custa mais para você e ainda dá mais crédito aos seus clientes. Como o prazo de 30/10/2026 já passou, confirme com seu contador a próxima janela (março) antes de mudar de regime.',
    avaliar: 'O híbrido custa mais para você, mas o crédito extra dos seus clientes é maior que esse custo. Se você conseguir repassar parte disso no preço do atacado, pode valer a pena. Se você já optou pelo híbrido para o 1º semestre de 2027, o cancelamento só é possível até 20/12/2026. Se ainda não optou, decida com seu contador antes da próxima janela, em março.',
    fora: 'Com essa receita, a empresa passa do limite do Simples Nacional (R$ 4,8 milhões em 12 meses). Este simulador não se aplica.',
  },
  extra: 'Diferença de custo no híbrido: {custo} por mês · Crédito a mais para seus clientes: {credito} por mês',
  saldo: 'Sobra de crédito para os próximos meses: {valor}',
  ctaTitle: 'Quer ver o Jinlong na sua loja?',
  ctaLead: 'ERP e PDV em português e chinês para quem vende no atacado e no varejo.',
  cta: 'Agendar demonstração',
  back: 'Voltar ao site',
  sourcesTitle: 'Fontes e premissas (consultadas em 21/10/2026)',
  sourceStatus: { oficial: 'fonte oficial', secundaria: 'fonte secundária — conferir', hipotese: 'hipótese — não oficial' },
  privacy: 'O cálculo acontece no seu navegador. Nenhum dado é enviado ou guardado.',
}

const zh: SimuladorCopy = {
  metaTitle: '简易税制 普通 vs 混合模式模拟器（2027 年 IBS/CBS）| Jinlong 金龙',
  metaDescription:
    '巴西 Simples Nacional 批发商：比较 IBS 和 CBS 在 DAS 内缴纳或单独缴纳（混合模式）的成本，以及您的客户能获得的税收抵扣。2027 年上半年选择截止日期为 2026 年 10 月 30 日，已经过去；取消截止日期为 2026 年 12 月 20 日。',
  eyebrow: '2027 税制改革',
  title: '简易税制：普通模式还是混合模式？',
  lead: '如果您向企业批发销售，从 2027 年起，客户会关注您的发票能带来多少 IBS 和 CBS 抵扣。几秒钟比较两种选择。',
  deadline: '2027 年上半年选择混合模式的截止日期为 2026 年 10 月 30 日，已经过去。可在 2026 年 11 月 3 日至 12 月 20 日取消；之后在 3 月和 9 月可重新选择。',
  disclaimer: '仅为估算 — 请与您的会计师确认。仅适用于附表 I（商业），2027 年 CBS 税率尚未正式公布。',
  inputs: {
    faturamento: '月平均营业额（雷亚尔）',
    rbt12: '过去 12 个月收入（雷亚尔，可选）',
    rbt12Hint: '留空则按月营业额 × 12 计算。',
    b2b: '卖给可抵扣企业的销售占比（%）',
    b2bHint: '批发给普通税制的商店和企业。其余为零售给最终消费者。',
    compras: '每月可抵扣 IBS/CBS 的采购额（雷亚尔）',
    comprasHint: '来自普通税制供应商的采购、进口等。',
    anexo: 'Simples 附表',
    anexoValue: '附表 I — 商业',
    cbs: '2027 年 CBS + IBS 税率（%）',
    cbsHint: '假设：CBS 8.8% + IBS 0.1%。正式 CBS 税率将于 2026 年 12 月 15 日前公布。',
  },
  table: { head: '每月（估算）', puro: '普通简易税制', hibrido: '混合简易税制', das: 'DAS', porFora: '单独缴纳 IBS/CBS', total: '总成本', credito: '给客户的抵扣', faixa: '级别', efetiva: '实际税率' },
  rec: {
    puro: '根据您输入的数据，普通模式成本较低，客户多得的抵扣不足以弥补。请把这个结果交给您的会计师。',
    hibrido: '根据您输入的数据，混合模式不会增加您的成本，还能给客户更多抵扣。由于 10 月 30 日的截止日期已经过去，请在下一个窗口（3 月）前与会计师确认。',
    avaliar: '混合模式会增加您的成本，但客户多得的抵扣大于这部分成本。如果能在批发价中转嫁一部分，可能值得。如果您已选择 2027 年上半年的混合模式，只能在 2026 年 12 月 20 日前取消。如果尚未选择，请在下一个窗口（3 月）前与会计师决定。',
    fora: '按此收入，企业超过 Simples Nacional 上限（12 个月 480 万雷亚尔），本模拟器不适用。',
  },
  extra: '混合模式成本差额：每月 {custo} · 客户多得抵扣：每月 {credito}',
  saldo: '留到以后月份的抵扣余额：{valor}',
  ctaTitle: '想在您的店里看看金龙系统？',
  ctaLead: '中文和葡萄牙语的 ERP 和收银系统，适合批发和零售商家。',
  cta: '预约演示',
  back: '返回网站',
  sourcesTitle: '资料来源和假设（2026 年 10 月 21 日查阅，葡萄牙语）',
  sourceStatus: { oficial: '官方来源', secundaria: '二手来源 — 待核实', hipotese: '假设 — 非官方' },
  privacy: '计算在您的浏览器中完成，不发送也不保存任何数据。',
}

export function getSimuladorCopy(locale: SiteLocale): SimuladorCopy {
  return locale === 'zh-CN' ? zh : pt
}

export const SIMULADOR_SLUG = 'simulador-simples-hibrido'
