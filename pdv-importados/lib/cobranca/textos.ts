/** Textos da cobrança/trial em pt-BR e zh (revisão por nativo pendente — ver PR). */
export const TEXTOS_COBRANCA = {
  pt: {
    titulo: 'Assinatura', plano: 'Plano', status: 'Situação', proximaFatura: 'Próxima fatura', vencimento: 'Vencimento',
    pagar: 'Pagar agora', pixCopiaCola: 'Pix copia e cola', trocarPlano: 'Trocar plano', cancelar: 'Cancelar assinatura',
    confirmarCancelar: 'Tem certeza? Você usa até o fim do período pago.', assinar: 'Assinar', lojas: 'Lojas', caixas: 'Caixas',
    forma: 'Forma de pagamento', total: 'Total mensal', precoProvisorio: 'Preços provisórios (em definição).',
    legado: 'Sua empresa está no plano piloto, sem cobrança automática.', somenteDono: 'Somente o DONO gerencia a assinatura.',
    trialAte: 'Teste grátis até', semFatura: 'Nenhuma fatura em aberto.',
    status_TRIAL: 'Teste grátis', status_ATIVA: 'Ativa', status_INADIMPLENTE: 'Pagamento em atraso', status_SUSPENSA: 'Suspensa', status_CANCELADA: 'Cancelada',
    trialTitulo: 'Teste grátis por 15 dias', trialSub: 'Sem cartão. Loja demo pronta para vender em minutos.',
    empresa: 'Nome da empresa', nome: 'Seu nome', email: 'E-mail', senha: 'Senha (mín. 8)', telefone: 'WhatsApp (opcional)',
    aceite: 'Li e aceito os termos de uso e a política de privacidade', criar: 'Começar teste grátis',
    verifiqueEmail: 'Pronto! Enviamos um link de confirmação para o seu e-mail. Confirme para entrar.',
  },
  zh: {
    titulo: '订阅', plano: '方案', status: '状态', proximaFatura: '下一张账单', vencimento: '到期日',
    pagar: '立即付款', pixCopiaCola: 'Pix 复制粘贴码', trocarPlano: '更换方案', cancelar: '取消订阅',
    confirmarCancelar: '确定吗？已付费周期内仍可使用。', assinar: '订阅', lojas: '门店', caixas: '收银台',
    forma: '付款方式', total: '每月合计', precoProvisorio: '价格为暂定（待确定）。',
    legado: '贵公司为试点方案，无自动扣费。', somenteDono: '仅老板（DONO）可管理订阅。',
    trialAte: '免费试用至', semFatura: '没有待付账单。',
    status_TRIAL: '免费试用', status_ATIVA: '有效', status_INADIMPLENTE: '付款逾期', status_SUSPENSA: '已暂停', status_CANCELADA: '已取消',
    trialTitulo: '免费试用 15 天', trialSub: '无需信用卡，示范门店几分钟即可开始销售。',
    empresa: '公司名称', nome: '您的姓名', email: '电子邮箱', senha: '密码（至少8位）', telefone: 'WhatsApp（可选）',
    aceite: '我已阅读并同意使用条款和隐私政策', criar: '开始免费试用',
    verifiqueEmail: '完成！我们已向您的邮箱发送确认链接，请确认后登录。',
  },
} as const
export type IdiomaCobranca = keyof typeof TEXTOS_COBRANCA
export type ChaveTexto = keyof (typeof TEXTOS_COBRANCA)['pt']
export const tc = (idioma: string | null | undefined, k: ChaveTexto): string =>
  TEXTOS_COBRANCA[idioma === 'zh' ? 'zh' : 'pt'][k]
