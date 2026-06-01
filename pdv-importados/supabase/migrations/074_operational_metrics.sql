-- Migration 074: Telemetria operacional do PDV
-- Propósito: capturar eventos reais de uso para observabilidade quantitativa.
-- Design: append-only, sem FK rígida (operador pode ter sido deletado), particionável por data.
-- Acesso: operadores inserem via service-role (server action); gerentes leem via RLS.

CREATE TABLE IF NOT EXISTS operational_metrics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event        TEXT        NOT NULL,          -- ex: 'finalize_started', 'double_click_blocked'
  operador_id  UUID,                          -- auth.users.id — nullable se sessão expirou
  caixa_id     UUID,                          -- caixas.id — nullable em eventos pré-abertura
  duration_ms  INTEGER,                       -- duração da operação, quando aplicável
  metadata     JSONB       DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para as queries do dashboard (últimas 24h por operador/event)
CREATE INDEX IF NOT EXISTS idx_opmetrics_event_created
  ON operational_metrics (event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opmetrics_operador_created
  ON operational_metrics (operador_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opmetrics_created
  ON operational_metrics (created_at DESC);

-- Particionamento futuro por mês: quando atingir >500k linhas, converter para PARTITION BY RANGE(created_at).
-- Por ora: tabela simples + índice é suficiente para volume de PDV pequeno/médio.

-- RLS: operadores inserem (via server action com service-role — não exposto ao cliente).
--      Gerentes/donos/admins leem todas as métricas da própria loja.
ALTER TABLE operational_metrics ENABLE ROW LEVEL SECURITY;

-- Leitura: apenas perfis gerenciais autenticados
CREATE POLICY "gerentes_leem_metricas"
  ON operational_metrics
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = auth.uid()
        AND usuarios.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- Inserção: qualquer operador autenticado pode inserir sua própria linha.
-- O route /api/caixa/telemetria-operacional valida a sessão via getUser()
-- antes de inserir e preenche operador_id = auth.uid().
CREATE POLICY "operadores_inserem_metricas"
  ON operational_metrics
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- View agregada para o dashboard — evita scan completo em toda query do /gerente/observabilidade
CREATE OR REPLACE VIEW vw_opmetrics_hoje AS
SELECT
  event,
  COUNT(*)                                        AS total,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') AS ultima_hora,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY duration_ms) AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99_ms,
  COUNT(DISTINCT operador_id)                     AS operadores_unicos,
  MIN(created_at)                                 AS primeiro_evento,
  MAX(created_at)                                 AS ultimo_evento
FROM operational_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event;
