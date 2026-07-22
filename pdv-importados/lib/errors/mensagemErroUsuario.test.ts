import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mensagemErroComSecao,
  mensagemErroDeExcecao,
  mensagemErroParaUsuario,
  mensagemErroValidacaoZod,
} from './mensagemErroUsuario'

describe('mensagemErroParaUsuario', () => {
  it.each([
    [
      'new row violates row-level security policy for table "vendas"',
      'Você não tem permissão para esta ação. Peça ao gerente ou verifique seu usuário no sistema.',
    ],
    [
      'JSON object requested, multiple (or no) rows returned',
      'Não foi possível encontrar um registro único para esta operação. Atualize a tela e tente novamente.',
    ],
    [
      'Could not find the function public.finalizar_venda_transacional_canonica_v2',
      'Uma função necessária do banco não foi encontrada. Pode faltar migration no ambiente.',
    ],
    [
      'duplicate key value violates unique constraint "usuarios_email_key"',
      'Este registro já existe ou há conflito com outro cadastro (dados duplicados).',
    ],
    [
      'duplicate key value violates unique constraint "produtos_codigo_barras_loja_unique"',
      'Código de barras já cadastrado nesta loja. Busque o produto existente no catálogo.',
    ],
    [
      'violates foreign key constraint "vendas_caixa_id_fkey"',
      'Dados inconsistentes: existe referência a um registro que não existe ou não pode ser usado.',
    ],
    [
      'permission denied for table usuarios',
      'Acesso negado a dados do sistema. Verifique o perfil da sua conta.',
    ],
    [
      'relation "public.caixas" does not exist',
      'Falta alguma tabela ou função no banco de dados. Contate o suporte técnico.',
    ],
    [
      'column "valor_liquido_total" does not exist',
      'A estrutura do banco está diferente do esperado (coluna ausente). Contate o suporte técnico.',
    ],
    [
      'TypeError: Failed to fetch',
      'Falha de rede: o navegador não conseguiu falar com o servidor. Verifique a internet, firewall ou se o projeto Supabase está ativo.',
    ],
    [
      'canceling statement due to statement timeout',
      'A operação demorou demais e foi interrompida. Tente novamente.',
    ],
    [
      'Too many requests',
      'Muitas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente.',
    ],
    [
      'Invalid login credentials',
      'Email ou senha incorretos.',
    ],
    [
      'email rate limit exceeded',
      'Limite de envio de email atingido. Aguarde alguns minutos para tentar novamente.',
    ],
    [
      'signup is disabled',
      'O cadastro de novos usuários está desativado neste ambiente.',
    ],
    [
      'invalid api key',
      'Configuração inválida de acesso ao Supabase (chave pública). Revise o .env e reinicie a aplicação.',
    ],
    [
      'invalid input syntax for type uuid: "123"',
      'Identificador inválido. Atualize a página e tente de novo.',
    ],
    [
      'Check constraint "caixas_valor_inicial_check"',
      'Os dados não atendem a uma regra do sistema. Revise os valores e tente novamente.',
    ],
    [
      'Required',
      'Preencha todos os campos obrigatórios.',
    ],
    [
      'Expected number, received string',
      'Um valor numérico é obrigatório neste campo.',
    ],
    [
      'Too small: expected array to have >=1 items',
      'É necessário pelo menos um item na lista.',
    ],
  ])('traduz: %s', (entrada, esperado) => {
    expect(mensagemErroParaUsuario(entrada)).toBe(esperado)
  })

  it('preserva mensagem já amigável em português', () => {
    const msg = 'Sessão expirada. Faça login novamente.'
    expect(mensagemErroParaUsuario(msg)).toBe(msg)
  })

  it('usa fallback com detalhe técnico quando não reconhece padrão', () => {
    const raw = 'unexpected error: upstream returned gibberish'
    const out = mensagemErroParaUsuario(raw)
    expect(out).toContain(
      'Não foi possível concluir esta operação agora. Tente de novo em alguns instantes.',
    )
    expect(out).toContain('«unexpected error: upstream returned gibberish»')
  })

  it('retorna mensagem padrão para entrada vazia', () => {
    expect(mensagemErroParaUsuario('   ')).toBe(
      'Não foi possível concluir esta operação agora. Tente de novo em alguns instantes.',
    )
  })
})

describe('helpers de mensagemErroUsuario', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mensagemErroComSecao prefixa o contexto', () => {
    expect(mensagemErroComSecao('Caixa', 'permission denied for table caixas')).toBe(
      'Caixa: Acesso negado a dados do sistema. Verifique o perfil da sua conta.',
    )
  })

  it('mensagemErroValidacaoZod inclui prefixo Dados inválidos', () => {
    expect(mensagemErroValidacaoZod('Expected number, received string')).toBe(
      'Dados inválidos: Um valor numérico é obrigatório neste campo.',
    )
  })

  it('mensagemErroParaUsuario traduz para chinês simplificado quando idioma=zh', () => {
    expect(mensagemErroParaUsuario('Invalid login credentials', 'zh')).toBe('邮箱或密码错误。')
  })

  it('mensagemErroValidacaoZod usa prefixo em chinês simplificado quando idioma=zh', () => {
    expect(mensagemErroValidacaoZod('Expected number, received string', 'zh')).toBe(
      '数据无效：该字段必须填写数字。',
    )
  })

  it('traduz mensagens de negócio em PT para mandarim quando idioma=zh', () => {
    expect(
      mensagemErroParaUsuario('O preço de varejo deve ser maior que zero.', 'zh'),
    ).toBe('零售价必须大于零。')
    expect(
      mensagemErroParaUsuario('O preço de custo não pode ser negativo.', 'zh'),
    ).toBe('成本价不能为负数。')
    expect(
      mensagemErroParaUsuario('Motivo de ajuste inválido.', 'zh'),
    ).toBe('调整原因无效。')
  })

  it('preserva a mensagem de negócio original quando idioma=pt', () => {
    const msg = 'O preço de varejo deve ser maior que zero.'
    expect(mensagemErroParaUsuario(msg, 'pt')).toBe(msg)
  })

  it('traduz lista de issues (unidas por ;) de negócio para mandarim', () => {
    expect(
      mensagemErroValidacaoZod(
        'O nome deve ter pelo menos 2 caracteres.; O preço de varejo deve ser maior que zero.',
        'zh',
      ),
    ).toBe('数据无效：商品名称至少需要 2 个字符。；零售价必须大于零。')
  })

  it('traduz guarda de estoque insuficiente para mandarim; mantém termo em PT', () => {
    expect(
      mensagemErroParaUsuario('Estoque insuficiente para produto X: solicitado 5, disponível 2.', 'zh'),
    ).toBe('库存不足，无法完成本次操作。请先核对该商品的库存余额后再试。')
    expect(
      mensagemErroParaUsuario('Estoque insuficiente para produto X: solicitado 5, disponível 2.'),
    ).toContain('Estoque insuficiente')
  })

  it('mensagemErroComSecao traduz o rótulo de seção quando idioma=zh', () => {
    expect(
      mensagemErroComSecao('Preço varejo', 'O preço de varejo deve ser maior que zero.', 'zh'),
    ).toBe('零售价：零售价必须大于零。')
  })

  it('mensagemErroDeExcecao usa fallback quando não recebe Error', () => {
    expect(mensagemErroDeExcecao(null, 'Falha genérica.')).toBe('Falha genérica.')
  })
})
