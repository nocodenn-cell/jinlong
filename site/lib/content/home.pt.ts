import type { HomeContent } from './types'

export const homePt: HomeContent = {
  meta: {
    title: 'Jinlong · PDV e gestão para varejo e atacado, em português e chinês',
    description:
      'PDV e gestão para varejo e atacado, em português e chinês. Venda, controle seu estoque e acompanhe seu negócio em um só sistema.',
  },
  skipLink: 'Ir para o conteúdo principal',
  brandLabel: '金龙 Jinlong — início',
  nav: {
    label: 'Principal',
    benefits: 'Benefícios',
    how: 'Como funciona',
    panel: 'Painel',
    login: 'Entrar',
    cta: 'Teste 15 dias',
    menuOpen: 'Abrir menu',
    menuClose: 'Fechar menu',
  },
  langSwitch: { group: 'Idioma / 语言', pt: 'PT-BR', ptShort: 'PT', zh: '简体中文', zhShort: '中文' },
  hero: {
    badge: 'PDV em português e chinês',
    h1: { line1: 'Seu caixa simples.', line2: 'Sua loja sob controle.' },
    lead: 'Venda no varejo e no atacado, controle o estoque e acompanhe seus resultados. Tudo em um sistema em português e chinês, feito para quem está no balcão.',
    ctaPrimary: 'Solicitar 15 dias de teste',
    ctaSecondary: 'Ver como funciona',
    microcopy: 'Teste mediante solicitação. A liberação é combinada com nossa equipe.',
  },
  mock: {
    items: [
      { name: 'Kit pote hermético 3 pç', sku: 'SKU: KIT-003 · atacado 10+', price: 'R$ 185,00' },
      { name: 'Garrafa térmica 500 ml', sku: 'SKU: GAR-500', price: 'R$ 39,90' },
    ],
    totalLabel: 'Total',
    total: 'R$ 224,90',
    finish: 'Finalizar venda',
    aria: 'Exemplo de venda no PDV do Jinlong, com dados fictícios: 2 produtos, total de 224 reais e 90 centavos.',
  },
  benefits: {
    title: 'Tudo que você precisa para vender melhor',
    subtitle: 'Simples, rápido e feito para lojas de varejo e atacado',
    items: [
      { title: 'Venda rápido', body: 'Monte a venda, escolha a forma de pagamento e finalize sem complicação.' },
      { title: 'Controle estoque', body: 'Cadastre seus produtos e saiba quanto tem de cada um.' },
      { title: 'Varejo e atacado', body: 'Defina a partir de qual quantidade vale o preço de atacado.' },
      { title: 'Português e chinês', body: 'Cada pessoa da equipe usa o idioma em que trabalha melhor.' },
    ],
  },
  steps: {
    title: 'Comece a vender em 3 passos',
    subtitle: 'Simples assim. Com orientação da nossa equipe.',
    items: [
      { title: 'Fale com a gente', body: 'Combine uma demonstração ou o teste de 15 dias.' },
      { title: 'Cadastre produtos', body: 'Preços de varejo e atacado, estoque e formas de pagamento.' },
      { title: 'Comece a vender', body: 'Abra o caixa e atenda seus clientes, no seu idioma.' },
    ],
  },
  panel: {
    title: 'Acompanhe tudo em um só lugar',
    subtitle: 'Veja como sua loja está indo. Exemplo com dados fictícios.',
    sample: 'Dados fictícios',
    stats: [
      { label: 'Vendas hoje', value: 'R$ 2.450', note: '+12% vs ontem' },
      { label: 'Ticket médio', value: 'R$ 87,50', note: '28 vendas' },
      { label: 'Estoque baixo', value: '5', note: 'produtos' },
    ],
    topTitle: 'Produtos mais vendidos',
    top: [
      { name: 'Garrafa térmica 500 ml', sales: '18 vendas', total: 'R$ 718,20' },
      { name: 'Kit pote hermético 3 pç', sales: '25 vendas', total: 'R$ 462,50' },
    ],
  },
  final: {
    title: 'Pronto para vender mais?',
    lead: 'Conheça o Jinlong em uma demonstração ou solicite 15 dias de teste.',
    cta: 'Solicitar 15 dias de teste',
    checks: ['15 dias de teste', 'Português e chinês', 'Varejo e atacado'],
  },
  contact: {
    whatsapp: 'Falar no WhatsApp',
    wechat: 'Falar no WeChat',
    wechatIdLabel: 'ID do WeChat',
    opensNewTab: 'abre em nova aba',
    soon: 'Canais de contato em breve',
  },
  footer: {
    tagline: 'Seu caixa simples. Sua loja sob controle.',
    productTitle: 'Produto',
    companyTitle: 'Contato',
    legalTitle: 'Legal',
    privacy: 'Privacidade',
    terms: 'Termos de uso',
    login: 'Entrar no Jinlong',
    ptOnly: '',
    rights: 'Todos os direitos reservados.',
  },
  draftBanner: '',
}
