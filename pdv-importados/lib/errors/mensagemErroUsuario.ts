import { logCaughtServerError } from '@/lib/logging/server-error'

/**
 * Converte mensagens técnicas (PostgREST, Supabase Auth, rede, Zod em inglês)
 * em texto em português claro para o operador ou gerente.
 */

const MSG_PADRAO =
  'Não foi possível concluir esta operação agora. Tente de novo em alguns instantes.'

function truncar(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/**
 * Traduz erro vindo do Supabase/Postgres/rede. Mantém um trecho técnico curto ao final
 * quando não houver tradução específica, para facilitar suporte.
 */
export function mensagemErroParaUsuario(detalheTecnico: string): string {
  const raw = (detalheTecnico ?? '').trim()
  if (!raw) return MSG_PADRAO

  const lower = raw.toLowerCase()

  if (lower.includes('jwt') || lower.includes('invalid refresh token')) {
    if (lower.includes('expired') || lower.includes('expir')) {
      return 'Sua sessão expirou. Faça login novamente.'
    }
    return 'Sessão inválida. Faça login novamente.'
  }

  if (
    lower.includes('row-level security') ||
    lower.includes('violates row-level security') ||
    lower.includes('new row violates row-level security policy') ||
    (lower.includes('policy') && lower.includes('permission'))
  ) {
    return 'Você não tem permissão para esta ação. Peça ao gerente ou verifique seu usuário no sistema.'
  }

  // PostgREST: quando usamos .single() e volta 0 ou >1 linhas.
  if (
    lower.includes('json object requested, multiple (or no) rows returned') ||
    lower.includes('the result contains 0 rows')
  ) {
    return 'Não foi possível encontrar um registro único para esta operação. Atualize a tela e tente novamente.'
  }

  if (lower.includes('could not find the function') || lower.includes('function') && lower.includes('does not exist')) {
    return 'Uma função necessária do banco não foi encontrada. Pode faltar migration no ambiente.'
  }

  if (
    lower.includes('duplicate key') ||
    lower.includes('unique constraint') ||
    lower.includes('already exists')
  ) {
    return 'Este registro já existe ou há conflito com outro cadastro (dados duplicados).'
  }

  if (lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return 'Dados inconsistentes: existe referência a um registro que não existe ou não pode ser usado.'
  }

  if (lower.includes('permission denied for')) {
    return 'Acesso negado a dados do sistema. Verifique o perfil da sua conta.'
  }

  if (lower.includes('relation') && lower.includes('does not exist')) {
    return 'Falta alguma tabela ou função no banco de dados. Contate o suporte técnico.'
  }

  if (lower.includes('column') && lower.includes('does not exist')) {
    return 'A estrutura do banco está diferente do esperado (coluna ausente). Contate o suporte técnico.'
  }

  if (
    lower === 'failed to fetch' ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('net::err_')
  ) {
    return 'Falha de rede: o navegador não conseguiu falar com o servidor. Verifique a internet, firewall ou se o projeto Supabase está ativo.'
  }

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('statement timeout')) {
    return 'A operação demorou demais e foi interrompida. Tente novamente.'
  }

  if (lower.includes('too many requests') || lower.includes('429')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente.'
  }

  if (lower.includes('database error saving new user')) {
    return 'Não foi possível criar sua conta agora por falha no banco. Tente novamente em instantes.'
  }

  if (lower.includes('user already registered')) {
    return 'Este email já está cadastrado. Tente entrar ou recuperar a senha.'
  }

  if (lower.includes('email rate limit exceeded')) {
    return 'Limite de envio de email atingido. Aguarde alguns minutos para tentar novamente.'
  }

  if (lower.includes('signup is disabled')) {
    return 'O cadastro de novos usuários está desativado neste ambiente.'
  }

  if (lower.includes('invalid api key') || lower.includes('apikey') && lower.includes('invalid')) {
    return 'Configuração inválida de acesso ao Supabase (chave pública). Revise o .env e reinicie a aplicação.'
  }

  if (lower.includes('invalid input syntax') && lower.includes('uuid')) {
    return 'Identificador inválido. Atualize a página e tente de novo.'
  }

  if (lower.includes('numeric field overflow') || lower.includes('value out of range')) {
    return 'Valor numérico fora do limite permitido. Confira os valores informados.'
  }

  if (lower.includes('check constraint')) {
    return 'Os dados não atendem a uma regra do sistema. Revise os valores e tente novamente.'
  }

  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'Email ou senha incorretos.'
  }

  if (lower.includes('email not confirmed')) {
    return 'Confirme seu email no link enviado pelo sistema antes de entrar.'
  }

  // Mensagens Zod comuns (inglês)
  if (lower.includes('required')) {
    return 'Preencha todos os campos obrigatórios.'
  }
  if (
    lower.includes('expected number') ||
    (lower.includes('invalid_type') && lower.includes('number'))
  ) {
    return 'Um valor numérico é obrigatório neste campo.'
  }
  if (lower.includes('expected string') && !lower.includes('expected string literal')) {
    return 'Formato de texto inválido em um dos campos.'
  }
  if (lower.includes('invalid uuid')) {
    return 'Identificador inválido. Atualize a página e tente novamente.'
  }
  if (lower.includes('too small') && lower.includes('array')) {
    return 'É necessário pelo menos um item na lista.'
  }
  if (lower.includes('number must be greater than 0') || lower.includes('too_small')) {
    return 'Use um número maior que zero onde for exigido.'
  }

  // Já está em português (heurística simples)
  const parecePt =
    /(ção|ões|não|você|sessão|caixa|venda|dados|senha|permissão|gerente|operador|tente|inválido|erro|falha|salvar|carregar|abrir|fechar|obrigat)/i.test(
      raw,
    ) && !/^(error|failed|invalid|unexpected|cannot|permission|relation)\b/i.test(raw)

  if (parecePt) return raw

  return `${MSG_PADRAO} Se precisar de ajuda, informe ao suporte: «${truncar(raw, 220)}».`
}

/** Prefixa a mensagem traduzida (ex.: contexto "Caixa", "Venda"). */
export function mensagemErroComSecao(secao: string, detalheTecnico: string): string {
  const s = secao.trim()
  const m = mensagemErroParaUsuario(detalheTecnico)
  if (!s) return m
  return `${s}: ${m}`
}

/** Junta issues do Zod já em string (inglês ou misto) e traduz o conjunto. */
export function mensagemErroValidacaoZod(issuesJuntas: string): string {
  const base = issuesJuntas.trim()
  if (!base) return 'Os dados enviados são inválidos. Revise o formulário.'
  const traduzida = mensagemErroParaUsuario(base)
  return `Dados inválidos: ${traduzida}`
}

/** Erros em `catch`: usa a mensagem da exceção traduzida, ou o fallback em português. */
export function mensagemErroDeExcecao(e: unknown, fallbackEmPortugues: string): string {
  logCaughtServerError('mensagemErroDeExcecao', e)
  if (e instanceof Error && e.message.trim()) {
    return mensagemErroParaUsuario(e.message)
  }
  return fallbackEmPortugues
}
