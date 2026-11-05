# Diagnóstico de timeouts e performance

Fonte: `pg_stat_statements` e `get_advisors` de produção (somente leitura, 2026-11-05) e `query_logs` das últimas 24 h. **O `pg_stat_statements` é acumulado desde o último reset, cuja data não foi verificada**; os números são de leitura, não de janela fixa.

## 1. Evidência de timeout

| Fonte | Achado |
|---|---|
| `postgrest_logs` (24 h) | 45 ocorrências de "Warp server error: Thread killed by timeout manager" (+ 2 de 4 min. anterior, somadas no total ~63 linhas de timeout). |
| `postgres_logs` | 20 ocorrências de `statement_timeout='58s'` vindas de `pg_temp.count_estimate` — **consulta interna do Supabase** (contagem estimada), não da aplicação. |
| `pgbouncer_logs` | 8 fechamentos por idle timeout (normal). |

Interpretação: o timeout que o usuário vê é do **PostgREST (request)**, não do statement do Postgres. Isso indica requisições longas ou em fila. Causa-raiz **não comprovada** nesta etapa; requer medição de `EXPLAIN (ANALYZE, BUFFERS)` em homologação.

## 2. Top custos acumulados (pg_stat_statements, produção)

| Consulta / função | Chamadas | Média | Máx. | Total | Leitura |
|---|---|---|---|---|---|
| `SELECT name FROM pg_timezone_names` | 1.692 | **648 ms** | **6.918 ms** | **1.096 s** | Maior custo de app. Vem de `relatorio_tz_validado` (prod, `prosrc` usa `pg_timezone_names`). |
| `pdv_config_flags_visuais()` (PostgREST) | 6.987 | 45,5 ms | 4.883 ms | 318 s | Chamada **em toda venda** (`registrarAlertasLevesVenda.ts:24`) e no admin. Corpo de 195 caracteres. |
| Relatórios RPC (`pgrst_source` com `p_de/p_ate/p_tz`) | 378 / 361 / 359 / 301 / 301 | 1,6–1,8 s | 6–7,4 s | 490–670 s cada | Confirma os ~1,6–1,8 s do relatório. Ligados a `relatorio_*_periodo` e `dashboard_gerente_resumo`, que usam `relatorio_tz_validado`. |
| `obter_status_caixa_operador` (PostgREST) | 1.258 | 220 ms | 5.215 ms | 277 s | Consulta de status do caixa; corpo de 210 caracteres. |
| `fiscal_worker_invoke()` | 82.421 | 13,6 ms | 931 ms | 1.121 s | Histórico de cron. `cron.job` consultado **retornou vazio** — cron desagendado (migration `20260731201800`). Confirmar. |
| `insert into cron.job_run_details` | 82.421 | 2,7 ms | 460 ms | 222 s | Mesmo histórico; cresce a tabela de runs. |
| `pg_available_extensions` / introspecção de tipos | 570 / 1.696 | 407 ms / 183 ms | 15 s / 7 s | 232 s / 311 s | Introspecção do próprio Supabase/PostgREST; não é consulta de app. |

**Ponto de atenção:** o relatório citou `registrar_venda_com_itens` com pico de 7,4 s e `pdv_config_flags_visuais` com 8.339 chamadas. Os números atuais diferem (6.987 chamadas). **Não reconciliados** por falta de janela comum.

## 3. Achado de maior ganho com menor risco: validação de fuso

- A migration **`20260913090000_relatorio_tz_validado_sem_pg_timezone_names.sql` existe no repositório, mas não está no ledger de produção** (consulta direta: `mig_20260913_aplicada = 0`).
- O próprio comentário da migration mede **745 ms** para `SELECT EXISTS (SELECT 1 FROM pg_timezone_names …)` e afirma que cada conexão nova de PostgREST paga esse custo na primeira RPC.
- Produção ainda usa a versão antiga (`relatorio_tz_validado` com `pg_timezone_names`).
- **Hipótese forte:** aplicar essa migration reduz o custo das RPCs de relatório e do dashboard. **A validar** em homologação: medir antes/depois com a mesma carga.
- Risco: baixo (o próprio arquivo prevê equivalência verificada com a função antiga). Ainda precisa do passo de reconciliação do ledger.

## 4. Advisors de performance (produção)

| Lint | Nível | Quantidade | Onde se concentra |
|---|---|---|---|
| Unindexed foreign keys | INFO | 120 | `comissoes_*` (~20), `caixas` (`caixas_autorizado_por_fkey`, `caixas_conta_financeira_id_fkey`), `conciliacoes_financeiras`, `contas_pagar_pagamentos` |
| Auth RLS initplan (`auth.uid()` não envolvido em `select`) | WARN | 31 | `funcionarios_meta` (4), `vendas_em_espera` (3), `clientes` (3), `funcionarios` (3), `fiscal_provider_config`, `pricing_config_versions` |
| Multiple permissive policies | WARN | 125 | `funcionarios_meta` (12), `clientes` (7), `categorias`, `estoque`, `lojas`, `usuarios` (3), `vendas` (3), `itens_venda` (2) |
| Unused index | INFO | 86 | `produtos` (6), `categorias` (5), `caixa_scan_telemetry_events` (5), `movimentacoes_caixa` (3) |
| No primary key | INFO | 1 | `_backup_schema_migrations_20260802` |

**Ação:** índices de FK em `caixas` e em `vendas` são candidatos, mas **não criar por tentativa** (regra do relatório). Primeiro medir: `EXPLAIN (ANALYZE, BUFFERS)` das queries reais, cardinalidade e seletividade. Remover índices não usados só depois de confirmar um período representativo.

## 5. Hipóteses sobre caixa e PDV (não comprovadas)

- **`obter_status_caixa_operador` e `pdv_config_flags_visuais`:** média de 45–220 ms para funções de corpo curto sugere custo de RLS (subconsulta em `usuarios` por linha, `fp_lojas_permitidas_arr()`) ou espera de lock, não custo de lógica. Medir `EXPLAIN` com role `authenticated` e JWT real em homologação.
- **Picos de 4–7 s** em funções curtas indicam contenção (locks, pool ou cold cache), não consulta lenta. Não verificado: `pg_stat_activity`, `pg_locks` e conexões (não consultados nesta etapa).
- **Latência app ↔ Supabase:** não medida. Depende de região (projeto em `sa-east-1`) e da hospedagem do app (Vercel). Medir com `Server-Timing` ou logs de função antes de atribuir culpa.
- **Re-renderizações e N+1 no cliente:** não investigadas nesta etapa.

## 6. Plano de medição (antes de qualquer correção)

1. Coletar baseline com a mesma janela: `pg_stat_statements` (reset controlado em homologação, não em produção), latências de PostgREST e tempo da RPC de relatório.
2. Para cada candidato: `EXPLAIN (ANALYZE, BUFFERS)` com role `authenticated` e JWT de operador, loja e volume reais (dados de homologação).
3. Aplicar a migration de fuso em homologação e medir o delta.
4. Só então decidir índices, com plano de manutenção.

## 7. Tabela de problemas (formato solicitado)

| Problema | Evidência | Causa-raiz | Impacto | Correção | Ganho esperado |
|---|---|---|---|---|---|
| Validação de fuso com `pg_timezone_names` em RPCs de relatório e dashboard | 648 ms média, 1.096 s total; migration de correção não aplicada | Migration `20260913090000` não promovida | Relatórios ~1,6–1,8 s; primeira RPC de conexão nova | Aplicar migration após reconciliação | **Alta (hipótese forte)** para relatórios |
| Timeouts PostgREST | 45 em 24 h | Requisições longas/em fila (causa não comprovada) | Erro na tela do PDV e relatórios | Medir antes de agir | Desconhecido |
| `pdv_config_flags_visuais` em toda venda | 6.987 chamadas, máx. 4,9 s | RLS/lock (hipótese) | Latência na finalização | Medir; cache de sessão ou função `STABLE` com menos joins | Média |
| `obter_status_caixa_operador` | 1.258 chamadas, 220 ms média | RLS/lock (hipótese) | Abertura e tela do caixa | Medir; simplificar predicado | Média |
| Índices de FK e multiple permissive policies | 120 e 125 lints | Schema acumulado | Escrita e planejamento mais lentos | Consolidar policies; índices após EXPLAIN | Baixa a média |
| Cron histórico (82 mil runs) | `cron.job_run_details` | Cron desagendado mas histórico crescente | Bloat e I/O | Limpar histórico com política de retenção | Baixa |

## 8. O que não faz parte desta etapa

- Nenhum índice criado.
- Nenhuma alteração de configuração do Supabase.
- Nenhuma medição de carga com escrita em produção.
