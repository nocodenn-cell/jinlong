/**
 * Mensagens amigáveis para erros técnicos — compartilhado entre `pdv-importados` e `pdv-local`.
 * Sem dependências de framework (Next/Tauri).
 */

/** Idiomas com mensagens de erro traduzidas. Intencionalmente mais estreito que `Idioma` —
 *  este arquivo não tem deps de framework e é compartilhado com `pdv-local`. */
export type IdiomaErro = 'pt' | 'zh'

const MSG_PADRAO: Record<IdiomaErro, string> = {
  pt: 'Não foi possível concluir esta operação agora. Tente de novo em alguns instantes.',
  zh: '当前无法完成该操作。请稍后再试。',
}

function idiomaSeguro(idioma?: string): IdiomaErro {
  if (idioma === 'zh') return idioma
  return 'pt'
}

/**
 * Dicionário das mensagens de negócio escritas em português (validações Zod e
 * guardas de domínio das Server Actions de gestão) para o mandarim. A chave é a
 * mensagem PT em minúsculas; o valor é a tradução polida e comercial.
 */
const MAPA_NEGOCIO_PT_ZH = new Map<string, string>([
  ['o nome deve ter pelo menos 2 caracteres.', '商品名称至少需要 2 个字符。'],
  ['o nome do produto é obrigatório', '请填写商品名称。'],
  ['o preço de varejo deve ser maior que zero.', '零售价必须大于零。'],
  ['informe um preço de varejo válido.', '请输入有效的零售价。'],
  ['o preço deve ser maior que zero.', '价格必须大于零。'],
  ['o preço de custo não pode ser negativo.', '成本价不能为负数。'],
  ['origem do produto inválida.', '商品来源无效。'],
  ['código de barras: mínimo 3 caracteres ou deixe em branco', '条形码：至少 3 个字符，或留空。'],
  ['id do produto inválido.', '商品 ID 无效。'],
  ['id inválido.', '标识符无效。'],
  ['produto inválido.', '商品无效。'],
  ['produto inválido', '商品无效。'],
  ['quantidade atual não pode ser negativa.', '当前数量不能为负数。'],
  ['estoque mínimo não pode ser negativo.', '最低库存不能为负数。'],
  ['motivo de ajuste inválido.', '调整原因无效。'],
  ['observação é obrigatória quando o motivo for outro.', '当原因为「其他」时，备注为必填项。'],
  ['observação muito longa (máx. 500 caracteres).', '备注过长（最多 500 个字符）。'],
  ['estoque já existe para este produto.', '该商品的库存记录已存在。'],
  ['não foi possível identificar sua loja. faça login novamente.', '无法识别您的门店，请重新登录。'],
  ['não foi possível salvar o produto. tente de novo.', '无法保存商品，请重试。'],
  ['falha ao carregar opções de filtro.', '无法加载筛选选项。'],
  ['erro de validação.', '提交的数据无效，请检查表单。'],
])

/**
 * Rótulos de seção (prefixo "Seção: …") usados pelas Server Actions de gestão,
 * traduzidos para o mandarim para que o prefixo não vaze em português na tela.
 */
const MAPA_SECAO_PT_ZH: Record<string, string> = {
  'preço varejo': '零售价',
  'preço de custo': '成本价',
  produto: '商品',
  produtos: '商品',
  'cadastro de produto': '商品登记',
  'estoque inicial do produto': '商品初始库存',
  estoque: '库存',
  'alterar situação': '更改状态',
  'bulk ativo': '批量启用/停用',
  'bulk categoria': '批量分类',
}

function t(idioma: IdiomaErro, pt: string, zh: string): string {
  if (idioma === 'pt') return pt
  return zh
}

function truncar(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/**
 * Traduz erro vindo do Supabase/Postgres/rede. Mantém um trecho técnico curto ao final
 * quando não houver tradução específica, para facilitar suporte.
 */
export function mensagemErroParaUsuario(detalheTecnico: string, idiomaInput?: string): string {
  const idioma = idiomaSeguro(idiomaInput)
  const raw = (detalheTecnico ?? '').trim()
  if (!raw) return MSG_PADRAO[idioma]

  const lower = raw.toLowerCase()

  // PDV desktop (Tauri): configuração de sync
  if (lower.includes('falta sync_endpoint') || lower.includes('sync_endpoint')) {
    return t(
      idioma,
      'Falta configurar SYNC_ENDPOINT no arquivo .env do PDV (URL da função de sincronização). Peça ao suporte técnico.',
      '请在 PDV 的 .env 文件中配置 SYNC_ENDPOINT（同步函数 URL）。请联系技术支持。',
    )
  }
  if (lower.includes('sync_key') || lower.includes('falta sync_key')) {
    return t(
      idioma,
      'Falta configurar SYNC_KEY no .env do PDV (mesmo segredo da nuvem). Peça ao suporte técnico.',
      '请在 PDV 的 .env 中配置 SYNC_KEY（需与云端密钥一致）。请联系技术支持。',
    )
  }

  if (lower.includes('jwt') || lower.includes('invalid refresh token')) {
    if (lower.includes('expired') || lower.includes('expir')) {
      return t(idioma, 'Sua sessão expirou. Faça login novamente.', '会话已过期，请重新登录。')
    }
    return t(idioma, 'Sessão inválida. Faça login novamente.', '会话无效，请重新登录。')
  }

  if (
    lower.includes('row-level security') ||
    lower.includes('violates row-level security') ||
    lower.includes('new row violates row-level security policy') ||
    (lower.includes('policy') && lower.includes('permission'))
  ) {
    return t(
      idioma,
      'Você não tem permissão para esta ação. Peça ao gerente ou verifique seu usuário no sistema.',
      '您没有执行此操作的权限。请联系经理或检查您的账号权限。',
    )
  }

  if (
    lower.includes('json object requested, multiple (or no) rows returned') ||
    lower.includes('the result contains 0 rows')
  ) {
    return t(
      idioma,
      'Não foi possível encontrar um registro único para esta operação. Atualize a tela e tente novamente.',
      '无法为该操作定位唯一记录。请刷新页面后重试。',
    )
  }

  if (lower.includes('could not find the function') || lower.includes('function') && lower.includes('does not exist')) {
    return t(
      idioma,
      'Uma função necessária do banco não foi encontrada. Pode faltar migration no ambiente.',
      '数据库缺少必需函数，环境可能未应用完整 migration。',
    )
  }

  if (
    lower.includes('duplicate key') ||
    lower.includes('unique constraint') ||
    lower.includes('already exists')
  ) {
    return t(
      idioma,
      'Este registro já existe ou há conflito com outro cadastro (dados duplicados).',
      '该记录已存在或与其他数据冲突（重复数据）。',
    )
  }

  if (lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return t(
      idioma,
      'Dados inconsistentes: existe referência a um registro que não existe ou não pode ser usado.',
      '数据不一致：引用了不存在或不可用的记录。',
    )
  }

  if (lower.includes('permission denied for')) {
    return t(
      idioma,
      'Acesso negado a dados do sistema. Verifique o perfil da sua conta.',
      '访问系统数据被拒绝。请检查您的账号权限。',
    )
  }

  if (lower.includes('relation') && lower.includes('does not exist')) {
    return t(
      idioma,
      'Falta alguma tabela ou função no banco de dados. Contate o suporte técnico.',
      '数据库缺少表或函数。请联系技术支持。',
    )
  }

  if (lower.includes('column') && lower.includes('does not exist')) {
    return t(
      idioma,
      'A estrutura do banco está diferente do esperado (coluna ausente). Contate o suporte técnico.',
      '数据库结构与预期不一致（缺少字段）。请联系技术支持。',
    )
  }

  if (
    lower === 'failed to fetch' ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('net::err_') ||
    lower.includes('connection') ||
    lower.includes('dns')
  ) {
    return t(
      idioma,
      'Falha de rede: o navegador não conseguiu falar com o servidor. Verifique a internet, firewall ou se o projeto Supabase está ativo.',
      '网络失败：浏览器无法连接服务器。请检查网络、防火墙或 Supabase 项目状态。',
    )
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('statement timeout')) {
    return t(
      idioma,
      'A operação demorou demais e foi interrompida. Tente novamente.',
      '操作超时并已中断，请重试。',
    )
  }

  if (lower.includes('too many requests') || lower.includes('429')) {
    return t(
      idioma,
      'Muitas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente.',
      '请求过于频繁，请稍候再试。',
    )
  }

  if (lower.includes('database error saving new user')) {
    return t(
      idioma,
      'Não foi possível criar sua conta agora por falha no banco. Tente novamente em instantes.',
      '数据库异常，当前无法创建账号。请稍后再试。',
    )
  }

  if (lower.includes('user already registered')) {
    return t(
      idioma,
      'Este email já está cadastrado. Tente entrar ou recuperar a senha.',
      '该邮箱已注册，请直接登录或找回密码。',
    )
  }

  if (lower.includes('email rate limit exceeded')) {
    return t(
      idioma,
      'Limite de envio de email atingido. Aguarde alguns minutos para tentar novamente.',
      '邮件发送频率超限，请稍后再试。',
    )
  }

  if (lower.includes('signup is disabled')) {
    return t(
      idioma,
      'O cadastro de novos usuários está desativado neste ambiente.',
      '当前环境已禁用新用户注册。',
    )
  }

  if (lower.includes('invalid api key') || lower.includes('apikey') && lower.includes('invalid')) {
    return t(
      idioma,
      'Configuração inválida de acesso ao Supabase (chave pública). Revise o .env e reinicie a aplicação.',
      'Supabase 访问配置无效（公开密钥）。请检查 .env 并重启应用。',
    )
  }

  if (lower.includes('invalid input syntax') && lower.includes('uuid')) {
    return t(idioma, 'Identificador inválido. Atualize a página e tente de novo.', '标识符无效，请刷新后重试。')
  }

  if (lower.includes('numeric field overflow') || lower.includes('value out of range')) {
    return t(
      idioma,
      'Valor numérico fora do limite permitido. Confira os valores informados.',
      '数值超出允许范围，请检查输入。',
    )
  }

  if (lower.includes('check constraint')) {
    return t(
      idioma,
      'Os dados não atendem a uma regra do sistema. Revise os valores e tente novamente.',
      '数据不满足系统规则，请检查后重试。',
    )
  }

  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return t(idioma, 'Email ou senha incorretos.', '邮箱或密码错误。')
  }

  if (lower.includes('email not confirmed')) {
    return t(
      idioma,
      'Confirme seu email no link enviado pelo sistema antes de entrar.',
      '请先通过系统邮件中的链接完成邮箱确认后再登录。',
    )
  }

  if (lower.includes('required')) {
    return t(idioma, 'Preencha todos os campos obrigatórios.', '请填写所有必填字段。')
  }
  if (
    lower.includes('expected number') ||
    (lower.includes('invalid_type') && lower.includes('number'))
  ) {
    return t(idioma, 'Um valor numérico é obrigatório neste campo.', '该字段必须填写数字。')
  }
  if (lower.includes('expected string') && !lower.includes('expected string literal')) {
    return t(idioma, 'Formato de texto inválido em um dos campos.', '某个字段的文本格式无效。')
  }
  if (lower.includes('invalid uuid')) {
    return t(idioma, 'Identificador inválido. Atualize a página e tente novamente.', '标识符无效，请刷新页面后重试。')
  }
  if (lower.includes('too small') && lower.includes('array')) {
    return t(idioma, 'É necessário pelo menos um item na lista.', '列表中至少需要一个项目。')
  }
  if (lower.includes('number must be greater than 0') || lower.includes('too_small')) {
    return t(idioma, 'Use um número maior que zero onde for exigido.', '该字段必须大于 0。')
  }

  // ── Mensagens de negócio em português (validações Zod / guardas de domínio) ──
  // Quando o app está em mandarim, estas precisam aparecer em chinês polido; caso
  // contrário cairiam no fallback genérico que embute o texto em português na tela.
  // A entrada pode ser uma única mensagem ou várias unidas por "; " (Zod issues).
  const partesNegocio = raw.split(/\s*;\s*/).map((p) => p.trim()).filter(Boolean)
  if (partesNegocio.length > 0) {
    const traduzidas = partesNegocio.map((parte) => MAPA_NEGOCIO_PT_ZH.get(parte.toLowerCase()))
    if (traduzidas.every((tr) => tr !== undefined)) {
      // PT é a língua-fonte dessas mensagens: devolve o texto original já polido.
      if (idioma === 'pt') return raw
      return (traduzidas as string[]).join('；')
    }
  }

  // Guarda de estoque insuficiente (mensagem dinâmica vinda do banco com números).
  if (lower.includes('estoque insuficiente')) {
    return t(
      idioma,
      'Estoque insuficiente para concluir esta operação. Confira o saldo do produto e tente novamente.',
      '库存不足，无法完成本次操作。请先核对该商品的库存余额后再试。',
    )
  }

  const parecePt =
    /(ção|ões|não|você|sessão|caixa|venda|dados|senha|permissão|gerente|operador|tente|inválido|erro|falha|salvar|carregar|abrir|fechar|obrigat)/i.test(
      raw,
    ) && !/^(error|failed|invalid|unexpected|cannot|permission|relation)\b/i.test(raw)

  if (parecePt && idioma === 'pt') return raw

  return t(
    idioma,
    `${MSG_PADRAO.pt} Se precisar de ajuda, informe ao suporte: «${truncar(raw, 220)}».`,
    `${MSG_PADRAO.zh} 如需支持，请将以下信息告知技术支持：「${truncar(raw, 220)}」。`,
  )
}

/** Prefixa a mensagem traduzida (ex.: contexto "Caixa", "Venda"). */
export function mensagemErroComSecao(secao: string, detalheTecnico: string, idiomaInput?: string): string {
  const idioma = idiomaSeguro(idiomaInput)
  const s = secao.trim()
  const m = mensagemErroParaUsuario(detalheTecnico, idiomaInput)
  if (!s) return m
  if (idioma === 'zh') {
    const secaoZh = MAPA_SECAO_PT_ZH[s.toLowerCase()] ?? s
    return `${secaoZh}：${m}`
  }
  return `${s}: ${m}`
}

/** Alias usado pelo PDV desktop (`pdv-local`). */
export function mensagemErroComContexto(contexto: string, detalhe: string, idiomaInput?: string): string {
  return mensagemErroComSecao(contexto, detalhe, idiomaInput)
}

/** Junta issues do Zod já em string (inglês ou misto) e traduz o conjunto. */
export function mensagemErroValidacaoZod(issuesJuntas: string, idiomaInput?: string): string {
  const idioma = idiomaSeguro(idiomaInput)
  const base = issuesJuntas.trim()
  if (!base) {
    return t(
      idioma,
      'Os dados enviados são inválidos. Revise o formulário.',
      '提交的数据无效，请检查表单。',
    )
  }
  const traduzida = mensagemErroParaUsuario(base, idioma)
  return t(
    idioma,
    `Dados inválidos: ${traduzida}`,
    `数据无效：${traduzida}`,
  )
}

/** Erros em `catch`: mensagem traduzida ou fallback (sem logging — use wrapper no Next se precisar). */
export function mensagemErroDeExcecao(e: unknown, fallbackEmPortugues: string): string {
  if (e instanceof Error && e.message.trim()) {
    return mensagemErroParaUsuario(e.message)
  }
  return fallbackEmPortugues
}
