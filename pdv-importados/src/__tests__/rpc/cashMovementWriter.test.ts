import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCashMovementWriter } from 'app/caixa/server/cashMovementWriter';
import { CASH_ERROR_CODES } from '@shared-core/src/cash';

describe('cashMovementWriter RPC', () => {
  let mockSupabase: Partial<SupabaseClient>;
  let writer: ReturnType<typeof createCashMovementWriter>;

  beforeEach(() => {
    mockSupabase = {
      rpc: vi.fn(),
    };
    writer = createCashMovementWriter(mockSupabase as SupabaseClient);
  });

  describe('register - sucesso', () => {
    it('registra movimentação com dados válidos', async () => {
      const mockData = {
        movimentacao_id: 'mov-123',
        status_movimentacao: 'confirmada',
        saldo_atual: 500.0,
      };

      (mockSupabase.rpc as any).mockResolvedValueOnce({
        data: [mockData],
        error: null,
      });

      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 100.0,
        motivo: 'Sangria autorizada',
        idempotencyKey: 'idem-123',
      });

      expect(result.ok).toBe(true);
      expect((mockSupabase.rpc as any)).toHaveBeenCalledWith(
        'registrar_movimentacao',
        expect.objectContaining({
          p_caixa_id: 'caixa-1',
          p_tipo: 'ENTRADA',
          p_valor: 100.0,
          p_motivo: 'Sangria autorizada',
        }),
      );
    });

    it('retorna saldo atual atualizado', async () => {
      const mockData = {
        movimentacao_id: 'mov-456',
        status_movimentacao: 'confirmada',
        saldo_atual: 1500.0,
      };

      (mockSupabase.rpc as any).mockResolvedValueOnce({
        data: [mockData],
        error: null,
      });

      const result = await writer.register({
        caixaId: 'caixa-2',
        tipo: 'SAIDA',
        valor: 50.0,
        motivo: 'Pagamento fornecedor',
        idempotencyKey: 'idem-456',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.saldoAtual).toBe(1500.0);
      }
    });

    it('trata forma de pagamento opcional', async () => {
      (mockSupabase.rpc as any).mockResolvedValueOnce({
        data: [{ movimentacao_id: 'mov-789' }],
        error: null,
      });

      await writer.register({
        caixaId: 'caixa-3',
        tipo: 'ENTRADA',
        valor: 200.0,
        motivo: 'Venda contada',
        formaPagamento: 'DINHEIRO',
        idempotencyKey: 'idem-789',
      });

      expect((mockSupabase.rpc as any)).toHaveBeenCalledWith(
        'registrar_movimentacao',
        expect.objectContaining({
          p_forma_pagamento: 'DINHEIRO',
        }),
      );
    });
  });

  describe('register - validação', () => {
    it('rejeita valor inválido (negativo)', async () => {
      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: -100.0,
        motivo: 'Teste',
        idempotencyKey: 'idem-1',
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(CASH_ERROR_CODES.VALUE_INVALID);
      expect(result.error).toContain('inválido');
    });

    it('rejeita valor zero', async () => {
      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 0,
        motivo: 'Teste',
        idempotencyKey: 'idem-1',
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(CASH_ERROR_CODES.VALUE_INVALID);
    });

    it('rejeita motivo vazio', async () => {
      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 100.0,
        motivo: '',
        idempotencyKey: 'idem-1',
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(CASH_ERROR_CODES.MOTIVO_REQUIRED);
    });

    it('rejeita motivo muito curto', async () => {
      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 100.0,
        motivo: 'X',
        idempotencyKey: 'idem-1',
      });

      expect(result.ok).toBe(false);
      expect(result.code).toBe(CASH_ERROR_CODES.MOTIVO_REQUIRED);
    });

    it('rejeita idempotencyKey ausente', async () => {
      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 100.0,
        motivo: 'Teste válido',
        idempotencyKey: '',
      });

      expect(result.ok).toBe(false);
    });
  });

  describe('register - erro RPC', () => {
    it('trata erro de autorização do RPC', async () => {
      (mockSupabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'permission denied' },
      });

      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 100.0,
        motivo: 'Teste',
        idempotencyKey: 'idem-1',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('trata erro de conexão', async () => {
      (mockSupabase.rpc as any).mockRejectedValueOnce(
        new Error('Network timeout'),
      );

      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 100.0,
        motivo: 'Teste',
        idempotencyKey: 'idem-1',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Network timeout');
    });

    it('trata erro de validação no banco', async () => {
      (mockSupabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'SALDO_INSUFICIENTE' },
      });

      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'SAIDA',
        valor: 10000.0,
        motivo: 'Teste sem saldo',
        idempotencyKey: 'idem-1',
      });

      expect(result.ok).toBe(false);
    });

    it('trata idempotência (mesma chave duplicada)', async () => {
      const response = {
        data: [{ movimentacao_id: 'mov-dup-1' }],
        error: null,
      };

      (mockSupabase.rpc as any)
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(response);

      const command = {
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 100.0,
        motivo: 'Entrada duplicada',
        idempotencyKey: 'idem-idempotent',
      };

      const result1 = await writer.register(command);
      const result2 = await writer.register(command);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      // Ambas chamadas devem ter sido feitas (idempotência é no servidor)
      expect((mockSupabase.rpc as any)).toHaveBeenCalledTimes(2);
    });
  });

  describe('register - edge cases', () => {
    it('trata valor com muitas casas decimais', async () => {
      (mockSupabase.rpc as any).mockResolvedValueOnce({
        data: [{ movimentacao_id: 'mov-decimal' }],
        error: null,
      });

      const result = await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 123.456789,
        motivo: 'Teste decimal',
        idempotencyKey: 'idem-decimal',
      });

      expect(result.ok).toBe(true);
      expect((mockSupabase.rpc as any)).toHaveBeenCalledWith(
        'registrar_movimentacao',
        expect.objectContaining({
          p_valor: 123.456789,
        }),
      );
    });

    it('trata motivoCodigo customizado', async () => {
      (mockSupabase.rpc as any).mockResolvedValueOnce({
        data: [{ movimentacao_id: 'mov-code' }],
        error: null,
      });

      await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 100.0,
        motivo: 'Venda',
        motivoCodigo: 'VENDA_CASH',
        idempotencyKey: 'idem-code',
      });

      expect((mockSupabase.rpc as any)).toHaveBeenCalledWith(
        'registrar_movimentacao',
        expect.objectContaining({
          p_motivo_codigo: 'VENDA_CASH',
        }),
      );
    });

    it('trata tripla vinda: mobile + device_id + user_agent', async () => {
      (mockSupabase.rpc as any).mockResolvedValueOnce({
        data: [{ movimentacao_id: 'mov-mobile' }],
        error: null,
      });

      await writer.register({
        caixaId: 'caixa-1',
        tipo: 'ENTRADA',
        valor: 100.0,
        motivo: 'Teste mobile',
        idempotencyKey: 'idem-mobile',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        deviceId: 'device-uuid-123',
      });

      expect((mockSupabase.rpc as any)).toHaveBeenCalledWith(
        'registrar_movimentacao',
        expect.objectContaining({
          p_ip_address: '192.168.1.1',
          p_user_agent: 'Mozilla/5.0',
          p_device_id: 'device-uuid-123',
        }),
      );
    });
  });
});
