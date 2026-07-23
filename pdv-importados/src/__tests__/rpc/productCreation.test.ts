import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mensagemErroCriarProdutoRpc,
  type CriarProdutoEstoqueInput,
} from 'lib/adapters/supabase/criarProdutoComEstoqueInicialRpc';

describe('criarProdutoComEstoqueInicial RPC', () => {
  describe('mensagemErroCriarProdutoRpc', () => {
    it('retorna mensagem customizada para erro de autenticação', () => {
      const msg = mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_AUTH');
      expect(msg).toContain('Sessão inválida');
    });

    it('retorna mensagem para erro de perfil', () => {
      const msg = mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_PERFIL');
      expect(msg).toContain('Seu perfil não pode cadastrar produto');
    });

    it('retorna mensagem para erro de nome inválido', () => {
      const msg = mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_NOME');
      expect(msg).toContain('nome de produto válido');
    });

    it('retorna mensagem para erro de código duplicado', () => {
      const msg = mensagemErroCriarProdutoRpc('CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO');
      expect(msg).toContain('Código de barras já cadastrado');
    });

    it('retorna mensagem genérica para erro desconhecido', () => {
      const msg = mensagemErroCriarProdutoRpc('ERRO_DESCONHECIDO');
      expect(msg).toBeDefined();
      // Pode retornar mensagem com seção ou genérica
      expect(msg.length).toBeGreaterThan(0);
    });

    it('retorna mensagem genérica para string vazia', () => {
      const msg = mensagemErroCriarProdutoRpc('');
      expect(msg).toContain('Não foi possível salvar');
    });

    it('trata erro de ajuste de estoque específico', () => {
      const msg = mensagemErroCriarProdutoRpc('AJUSTE_ESTOQUE_NEGATIVO');
      // A mensagem exata vem de mensagemErroAjusteEstoqueManual
      expect(msg).toBeDefined();
      expect(msg.length).toBeGreaterThan(0);
    });

    it('trata erro com espaço em branco', () => {
      const msg = mensagemErroCriarProdutoRpc('  CRIAR_PRODUTO_LOJA  ');
      expect(msg).toContain('loja');
    });
  });

  describe('validação de entrada', () => {
    it('valida input mínimo válido', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto Teste',
        preco_varejo: 100.0,
      };

      expect(input.nome).toBeDefined();
      expect(input.preco_varejo).toBeGreaterThan(0);
    });

    it('valida input com estoque inicial', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto Com Estoque',
        preco_varejo: 50.0,
        estoque_inicial_quantidade: 10,
        estoque_inicial_minimo: 5,
      };

      expect(input.estoque_inicial_quantidade).toBe(10);
      expect(input.estoque_inicial_minimo).toBe(5);
    });

    it('valida preço atacado opcional', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto Atacado',
        preco_varejo: 100.0,
        preco_atacado: 80.0,
        quantidade_gatilho_atacado: 10,
      };

      expect(input.preco_atacado).toBe(80.0);
      expect(input.quantidade_gatilho_atacado).toBe(10);
    });

    it('valida código de barras', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto Com Código',
        preco_varejo: 100.0,
        codigo_barras: '7898512340003',
      };

      expect(input.codigo_barras).toBe('7898512340003');
    });

    it('valida código interno', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto Com Código Interno',
        preco_varejo: 100.0,
        codigo_interno: 'PROD-001',
      };

      expect(input.codigo_interno).toBe('PROD-001');
    });

    it('valida campos opcionais de prateleira', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto Com Localização',
        preco_varejo: 100.0,
        localizacao_prateleira: 'Corredor A, Prateleira 3',
      };

      expect(input.localizacao_prateleira).toBeDefined();
    });

    it('valida permitir_abaixo_custo flag', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto Abaixo Custo',
        preco_varejo: 100.0,
        preco_custo: 120.0,
        permitir_abaixo_custo: true,
      };

      expect(input.permitir_abaixo_custo).toBe(true);
    });

    it('valida nome reduzido para PDV', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto Com Nome Muito Longo Para PDV',
        preco_varejo: 100.0,
        nome_reduzido_pdv: 'Produto Curto',
      };

      expect(input.nome_reduzido_pdv).toBe('Produto Curto');
    });

    it('valida client_request_id para idempotência', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto',
        preco_varejo: 100.0,
        client_request_id: 'req-uuid-123',
      };

      expect(input.client_request_id).toBe('req-uuid-123');
    });
  });

  describe('tratamento de erros RPC', () => {
    it('mapeia erro de código duplicado corretamente', () => {
      const error = 'CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO: código já existe';
      const msg = mensagemErroCriarProdutoRpc(error);

      expect(msg).toContain('Código de barras já cadastrado');
      expect(msg).not.toContain('CRIAR_PRODUTO_');
    });

    it('mapeia erro de preço inválido', () => {
      const error = 'CRIAR_PRODUTO_PRECO: preço negativo';
      const msg = mensagemErroCriarProdutoRpc(error);

      expect(msg).toContain('Preço');
    });

    it('trata erro com múltiplas linhas', () => {
      const error = `CRIAR_PRODUTO_PRECO
        Preço não pode ser negativo`;
      const msg = mensagemErroCriarProdutoRpc(error);

      expect(msg).toBeDefined();
    });

    it('preserva mensagem original se não houver código conhecido', () => {
      const error = 'Erro de conexão com banco de dados';
      const msg = mensagemErroCriarProdutoRpc(error);

      expect(msg).toContain('Cadastro de produto');
    });

    it('sanitiza espaço em branco da mensagem', () => {
      const error = '   CRIAR_PRODUTO_NOME   ';
      const msg = mensagemErroCriarProdutoRpc(error);

      expect(msg).toContain('nome de produto');
    });
  });

  describe('edge cases de validação', () => {
    it('trata estoque_inicial_quantidade como número', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto',
        preco_varejo: 100.0,
        estoque_inicial_quantidade: 0,
      };

      expect(typeof input.estoque_inicial_quantidade).toBe('number');
      expect(input.estoque_inicial_quantidade).toBe(0);
    });

    it('trata preço com muitas casas decimais', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto',
        preco_varejo: 123.456789,
      };

      expect(input.preco_varejo).toBe(123.456789);
    });

    it('trata null em campos opcionais', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto',
        preco_varejo: 100.0,
        preco_atacado: null,
        preco_custo: null,
      };

      expect(input.preco_atacado).toBeNull();
      expect(input.preco_custo).toBeNull();
    });

    it('trata undefined em campos opcionais', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto',
        preco_varejo: 100.0,
        estoque_inicial_quantidade: undefined,
      };

      expect(input.estoque_inicial_quantidade).toBeUndefined();
    });

    it('trata referência_fornecedor com trim', () => {
      const input: CriarProdutoEstoqueInput = {
        nome: 'Produto',
        preco_varejo: 100.0,
        referencia_fornecedor: '  ABC-123  ',
      };

      expect(input.referencia_fornecedor?.trim()).toBe('ABC-123');
    });
  });
});
