/**
 * GROWTH-001 — toda contratação passa pelo comercial (dono da Nature Code), na Central de Conversão do hub.
 * O autoatendimento (dono assina/troca de plano sozinho, criando cobrança no Asaas) fica DESLIGADO por padrão;
 * só volta com COBRANCA_AUTOATENDIMENTO=1 configurado de propósito no servidor.
 * Desligado, /admin/assinatura envia um pedido de contratação (commercial_solicitar_contratacao).
 */
export function autoatendimentoAtivo(env: Record<string, string | undefined> = process.env): boolean {
  return env.COBRANCA_AUTOATENDIMENTO?.trim() === '1'
}
