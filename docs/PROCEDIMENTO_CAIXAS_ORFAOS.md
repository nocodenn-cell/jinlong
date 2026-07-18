# Procedimento — Caixas ABERTOS órfãos

## Sintoma

Linhas em `public.caixas` com `status = 'ABERTO'` e `data_abertura` antiga (dias/semanas), sem operador ativo no turno.

## Causa típica

- E2E / smoke interrompido após abrir turno
- Sessão de operador encerrada sem fechar caixa
- Falha de rede no fechamento

## Diagnóstico (SQL Editor / MCP)

```sql
SELECT id, operador_id, data_abertura, valor_inicial, saldo_atual, status
FROM public.caixas
WHERE status = 'ABERTO'
ORDER BY data_abertura;
```

## Correção (homolog / staging)

Fechar turnos órfãos com mais de 7 dias (ajuste o intervalo se necessário):

```sql
UPDATE public.caixas
SET
  status = 'FECHADO',
  data_fechamento = COALESCE(data_fechamento, now()),
  valor_fechamento = COALESCE(valor_fechamento, saldo_atual, valor_inicial, 0),
  fechamento_observacao = COALESCE(fechamento_observacao, '') ||
    CASE WHEN COALESCE(fechamento_observacao, '') = '' THEN '' ELSE ' | ' END ||
    'limpeza orfaos — documentado em docs/PROCEDIMENTO_CAIXAS_ORFAOS.md'
WHERE status = 'ABERTO'
  AND data_abertura < now() - interval '7 days';
```

Preferível em operação real: operador/gerente fecha via UI (`/caixa` → Fechar caixa) com valor do sistema.

## Evidência Missão 1 (2026-07-18 · jinlong)

- 3 caixas `ABERTO` desde 2026-06-18/19 fechados por este procedimento
- Pós-correção: `COUNT(*) WHERE status='ABERTO'` = 0
