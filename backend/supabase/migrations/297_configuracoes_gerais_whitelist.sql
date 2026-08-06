-- ============================================================================
-- 297 — Pacote 0: fecha F1-06/F1-14 (atualizarConfiguracao segura).
--
-- Problema: `configuracoes_gerais.chave` aceitava qualquer texto (sem
-- whitelist) e `atualizado_por` (coluna já existente, nullable) nunca era
-- gravado por nenhum dos dois escritores (`atualizarConfiguracao` em
-- app/gerente/configuracoes/actions.ts, `atualizarSuspensaoVendas` em
-- app/gerente/suspensao/actions.ts) — 100% das linhas com `atualizado_por`
-- nulo (achado F1-14).
--
-- Corrigido na camada de app (mesmo commit): as duas Server Actions passam a
-- gravar `atualizado_por` e `atualizarConfiguracao` rejeita chave fora da
-- whitelist antes de tocar o banco. Esta migration adiciona a segunda linha
-- de defesa na autoridade (Cap. 2 da arquitetura): CHECK na própria tabela,
-- que vale para qualquer escritor futuro, não só os dois atuais.
--
-- Fora de escopo desta migration (decisão registrada, não improvisada):
-- `loja_id` em `configuracoes_gerais` — o guia cita como alternativa
-- ("loja_id (ou migrar p/ pdv_config)"), mas as 8 chaves atuais são lidas
-- por `app/caixa/server/caixaConfiguracoes.impl.ts`,
-- `caixaGerenteDesconto.impl.ts` e `caixaConsultaRapida.impl.ts` — caminho
-- de checkout ativo do piloto em produção com cliente real. Introduzir
-- isolamento por loja exige tocar esses três leitores (fallback
-- global→loja) e não pode ser feito na mesma migration que uma correção
-- pontual de whitelist sem risco de regressão no caixa ao vivo. Registrado
-- como pendência explícita, não silenciosa — ver
-- docs/auditoria/AUDITORIA_F1_PARAMETRIZACAO.md (nota F1-06/F1-09).
-- ============================================================================

BEGIN;

ALTER TABLE public.configuracoes_gerais
  ADD CONSTRAINT chk_configuracoes_gerais_chave
  CHECK (chave IN (
    'cancelamento_maximo_valor_sem_gerente',
    'comissao_padrao_percentual',
    'desconto_maximo_operador_percentual',
    'estoque_minimo_padrao',
    'lead_time_max_dias',
    'lead_time_min_dias',
    'motivo_suspensao',
    'vendas_suspensas'
  ));

COMMENT ON CONSTRAINT chk_configuracoes_gerais_chave ON public.configuracoes_gerais IS
  'F1-06 (2026-08-05). Whitelist na autoridade — mesma lista de app/gerente/configuracoes/actions.ts. Qualquer chave nova precisa desta migration E da whitelist em app antes de existir.';

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_configuracoes_gerais_chave'
  ) THEN
    RAISE EXCEPTION 'MIG297_CHECK_AUSENTE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.configuracoes_gerais
    WHERE chave NOT IN (
      'cancelamento_maximo_valor_sem_gerente','comissao_padrao_percentual',
      'desconto_maximo_operador_percentual','estoque_minimo_padrao',
      'lead_time_max_dias','lead_time_min_dias','motivo_suspensao','vendas_suspensas'
    )
  ) THEN
    RAISE EXCEPTION 'MIG297_LINHA_FORA_DA_WHITELIST';
  END IF;

  RAISE NOTICE '297 OK — F1-06/F1-14 whitelist verificada';
END
$verify$;

COMMIT;
