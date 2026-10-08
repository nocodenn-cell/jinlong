import type { HomeContent } from './types'

export const homePt: HomeContent = {
  meta: {
    title: 'Jinlong · Caixa e estoque para lojas de importados',
    description:
      'Sistema de caixa e estoque para lojas de importados: varejo e atacado no preço certo, estoque que acompanha a venda e equipe em português ou chinês.',
  },
  nav: {
    features: 'Funcionalidades',
    demo: 'Demonstração',
    journey: 'Como começar',
    contact: 'Contato',
    login: 'Entrar',
    menuLabel: 'Seções da página',
  },
  hero: {
    eyebrow: 'Caixa e estoque para lojas de importados',
    title: 'Cada venda no preço certo. Cada item no estoque certo.',
    lead: 'O Jinlong aplica varejo e atacado sozinho, baixa o estoque a cada venda e fecha o caixa. Sua equipe usa em português ou em chinês, na mesma operação.',
    ctaPrimary: 'Ver como funciona',
    ctaSecondary: 'Falar com a gente',
    proof: ['Varejo e atacado automáticos', 'Estoque com histórico', 'Português e chinês'],
  },
  preview: {
    sample: 'Dados fictícios',
    sale: 'Venda de exemplo',
    qty: 'Qtd.',
    decrease: 'Diminuir quantidade de',
    increase: 'Aumentar quantidade de',
    atacado: 'Atacado',
    varejo: 'Varejo',
    total: 'Total',
    payment: 'Pagamento',
    methods: ['Pix', 'Dinheiro', 'Cartão'],
    hint: 'Experimente: leve um item a 6 unidades e veja o preço de atacado entrar.',
  },
  features: {
    eyebrow: 'O que o Jinlong faz',
    title: 'Do balcão ao fechamento do caixa',
    items: [
      {
        title: 'Varejo e atacado sem calculadora',
        body: 'Quando a quantidade atinge o mínimo, o preço de atacado entra sozinho. O balcão deixa de depender de conta de cabeça.',
        note: 'PDV',
      },
      {
        title: 'Estoque que acompanha a venda',
        body: 'Cada venda baixa o saldo e fica registrada no histórico de movimentações, com entrada, saída e ajuste.',
        note: 'Estoque',
      },
      {
        title: 'Pagamento parcial vira conta a receber',
        body: 'Quando o cliente paga só uma parte, o restante fica registrado como conta a receber, ligado ao cadastro dele.',
        note: 'Financeiro',
      },
      {
        title: 'Etiquetas com código de barras',
        body: 'Cadastre o produto, gere a etiqueta e imprima. O mesmo código passa no leitor do caixa.',
        note: 'Catálogo',
      },
      {
        title: 'Cada pessoa no seu idioma',
        body: 'Quem trabalha em chinês e quem trabalha em português usam o mesmo sistema, cada um na sua língua.',
        note: '中文 · PT',
      },
    ],
  },
  journey: {
    eyebrow: 'Como começar',
    title: 'Do primeiro contato à sua loja rodando',
    lead: 'Sem formulário e sem compromisso: a conversa começa pelo WhatsApp ou pelo WeChat.',
    steps: [
      {
        title: 'Demonstração gratuita',
        body: 'Mostramos o Jinlong funcionando com dados de exemplo, no ritmo da sua loja.',
      },
      {
        title: 'Teste de 15 dias',
        body: 'Preparamos uma loja de teste e acompanhamos o uso junto com você.',
      },
      {
        title: 'Assinatura',
        body: 'Se fizer sentido para o seu negócio, você continua. Se não, nada muda.',
      },
    ],
  },
  contact: {
    eyebrow: 'Contato',
    title: 'Vamos conversar sobre a sua loja',
    lead: 'Conte o que você vende e como é o seu balcão hoje. Respondemos em português ou em chinês.',
    unavailable: 'Os canais de atendimento serão divulgados em breve.',
    channels: {
      whatsapp: 'Conversar no WhatsApp',
      wechat: 'Adicionar no WeChat',
      wechatIdLabel: 'ID do WeChat',
      open: 'Abre em nova aba',
    },
  },
  footer: {
    rights: '© Jinlong. Todos os direitos reservados.',
    privacy: 'Privacidade',
    terms: 'Termos',
    ptOnly: '',
  },
  locale: {
    switchLabel: 'Idioma da página',
    other: '中文',
    draftBanner: '',
  },
}
