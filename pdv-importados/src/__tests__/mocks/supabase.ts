import { vi } from 'vitest';

/**
 * Mock factory for @supabase/supabase-js client
 * Simula respostas de RPC e queries para testes unitários
 */

export function createMockSupabaseClient() {
  return {
    rpc: vi.fn(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      signUp: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    },
  };
}

/**
 * Mock RPC response builder
 * Facilita criar respostas de RPC com tipo correto
 */
export function mockRpcResponse<T>(data: T) {
  return Promise.resolve({
    data,
    error: null,
    status: 200,
    statusText: 'OK',
  });
}

export function mockRpcError(message: string, code?: string) {
  return Promise.reject(
    new Error(message),
  );
}

/**
 * Mock preço produto fixture
 */
export const mockPrecoProdutoFixture = {
  sucesso: {
    preco: 150.0,
    desconto: 10.0,
    precoComDesconto: 140.0,
    margem: 35,
    categoria: 'VAREJO',
    dataAtualizacao: new Date().toISOString(),
  },
  varejo: {
    preco: 100.0,
    desconto: 0,
    precoComDesconto: 100.0,
    margem: 30,
    categoria: 'VAREJO',
  },
  atacado: {
    preco: 80.0,
    desconto: 0,
    precoComDesconto: 80.0,
    margem: 25,
    categoria: 'ATACADO',
  },
  comoDesconto: {
    preco: 200.0,
    desconto: 50.0,
    precoComDesconto: 150.0,
    margem: 40,
    categoria: 'PROMOCAO',
  },
};

/**
 * Mock venda fixture
 */
export const mockVendaFixture = {
  valida: {
    id: 'venda-123',
    loja_id: 'loja-456',
    operador_id: 'op-789',
    status: 'pendente',
    items: [
      { codigo: '7898512340003', quantidade: 2, preco: 100, total: 200 },
    ],
    total: 200,
    pagamentos: [{ metodo: 'DINHEIRO', valor: 200 }],
    data: new Date().toISOString(),
  },
  invalida: {
    items: [],
    total: 0,
    pagamentos: [],
  },
  multiPagamento: {
    id: 'venda-multi-123',
    items: [
      { codigo: 'codigo1', quantidade: 5, preco: 50, total: 250 },
    ],
    total: 250,
    pagamentos: [
      { metodo: 'DINHEIRO', valor: 100 },
      { metodo: 'PIX', valor: 150 },
    ],
  },
};

/**
 * Mock sync context fixture
 */
export const mockSyncContextFixture = {
  aguardando: {
    status: 'aguardando',
    pendencias: 5,
    ultimaSincronizacao: null,
    erros: 0,
  },
  sincronizando: {
    status: 'sincronizando',
    pendencias: 3,
    ultimaSincronizacao: new Date().toISOString(),
    erros: 0,
  },
  sucesso: {
    status: 'sucesso',
    pendencias: 0,
    ultimaSincronizacao: new Date().toISOString(),
    erros: 0,
  },
  erro: {
    status: 'erro',
    pendencias: 2,
    ultimaSincronizacao: new Date().toISOString(),
    erros: 1,
    ultimoErro: 'Network timeout',
  },
};

/**
 * Mock cart fixture
 */
export const mockCartFixture = {
  vazio: {
    items: [],
    total: 0,
    desconto: 0,
  },
  umItem: {
    items: [
      {
        id: 'item-1',
        codigo: '7898512340003',
        nome: 'Produto Teste',
        quantidade: 1,
        preco: 100,
        desconto: 0,
        total: 100,
      },
    ],
    total: 100,
    desconto: 0,
  },
  multiItem: {
    items: [
      {
        id: 'item-1',
        codigo: '001',
        quantidade: 2,
        preco: 50,
        desconto: 0,
        total: 100,
      },
      {
        id: 'item-2',
        codigo: '002',
        quantidade: 3,
        preco: 75,
        desconto: 10,
        total: 215,
      },
    ],
    total: 315,
    desconto: 10,
  },
};
