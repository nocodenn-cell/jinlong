import { describe, it, expect, beforeEach } from 'vitest';
import { logger } from './logger';

describe('Logger Desktop - Persistência', () => {
  beforeEach(() => {
    // Limpar localStorage antes de cada teste
    localStorage.clear();
    logger.clearLogs();
  });

  it('deve persistir logs no localStorage', () => {
    // Adicionar alguns logs
    logger.info('Test info message', { userId: '123' });
    logger.warn('Test warning message', { code: 'WARN_001' });
    logger.error('Test error message', { error: 'Something went wrong' });

    // Salvar no localStorage
    logger.saveToLocalStorage();

    // Verificar se foi salvo
    const saved = localStorage.getItem('pdv_logs');
    expect(saved).toBeTruthy();
    
    const parsedLogs = JSON.parse(saved!);
    expect(parsedLogs).toHaveLength(3);
    expect(parsedLogs[0].level).toBe('info');
    expect(parsedLogs[0].message).toBe('Test info message');
    expect(parsedLogs[0].context).toEqual({ userId: '123' });
  });

  it('deve carregar logs do localStorage', () => {
    // Simular dados existentes no localStorage
    const mockLogs = [
      {
        level: 'info',
        message: 'Existing log',
        timestamp: new Date().toISOString(),
        context: { existing: true }
      }
    ];
    localStorage.setItem('pdv_logs', JSON.stringify(mockLogs));

    // Carregar logs
    logger.loadFromLocalStorage();

    // Verificar se foram carregados
    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('Existing log');
    expect(logs[0].context).toEqual({ existing: true });
  });

  it('deve manter buffer em memória sincronizado', () => {
    // Adicionar logs
    logger.info('Memory test 1');
    logger.info('Memory test 2');

    // Verificar buffer
    const memoryLogs = logger.getLogs();
    expect(memoryLogs).toHaveLength(2);

    // Salvar e recarregar
    logger.saveToLocalStorage();
    logger.clearLogs();
    logger.loadFromLocalStorage();

    // Verificar se foram restaurados
    const restoredLogs = logger.getLogs();
    expect(restoredLogs).toHaveLength(2);
    expect(restoredLogs[0].message).toBe('Memory test 1');
    expect(restoredLogs[1].message).toBe('Memory test 2');
  });

  it('deve lidar com erros de localStorage gracefully', () => {
    // Simular erro no localStorage
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('Storage quota exceeded');
    };

    // Não deve lançar erro
    expect(() => {
      logger.saveToLocalStorage();
    }).not.toThrow();

    // Restaurar função original
    localStorage.setItem = originalSetItem;
  });
});
