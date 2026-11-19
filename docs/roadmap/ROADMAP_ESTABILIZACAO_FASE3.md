# Roadmap de estabilização — Fase 3

Hipótese inicial do relatório, ajustada pelas evidências desta etapa. Estimativas em dias-pessoa (DP) e não comprometidas.

## Ajustes em relação à ordem original

1. **Reconciliação de migrations entra antes de tudo.** O ledger de produção não contém versões do repo (ex.: `20260913090000`, `20261028110000`); nomes repetidos com versões diferentes. Sem isso, qualquer `apply` pode reaplicar ou pular SQL.
2. **A2 sai do Sprint 2.** O trigger `trg_caixas_fechado_imutavel` já está em produção. Migration 001 vira "não aplicar".
3. **Performance ganha um item de baixo risco e alto ganho** (migration de fuso) que pode ir antes do Sprint 4, após reconciliação.
4. **Backup entra em paralelo**, pois não há RPO comprovado.

---

## Sprint 1 — Acesso, inventário e validação (3–4 DP)

- **Objetivo:** fechar a lacuna entre relatório e repositório/produção.
- **Escopo:** reconciliar ledger; localizar ou recriar `migrations_preparadas/001–004` no repo (como arquivos versionados, para revisão); confirmar `demo-fluxo` (F14), `caixaVendaEspera`, varredura de todos os pacotes por escrita direta.
- **Dependências:** acesso de leitura ao projeto (já há); decisão do dono sobre onde ficam as migrations.
- **Arquivos:** `docs/security/*`, `backend/supabase/migrations/` (somente leitura nesta fase).
- **Migrations:** nenhuma aplicada.
- **Testes:** script de comparação repo × ledger (`supabase migration list` no ambiente de homologação).
- **Critérios de aceite:** lista de divergências zerada ou classificada; cada migration da fase com status "pronta / bloqueada" e motivo.
- **Riscos:** descobrir migration aplicada fora do histórico (já há indícios do GO-LIVE-02).
- **Condição de conclusão:** relatório de reconciliação aprovado.

## Sprint 2 — Segurança crítica: A1, A3 (e A2 só se D1 pedir) (6–8 DP)

- **Objetivo:** bloquear escrita direta de venda, item e pagamento; eliminar alteração/exclusão sem trilha.
- **Escopo:** migration 002 revisada (REVOKE + remoção de policies de escrita); nenhuma mudança no código do PDV, pois ele já usa RPC.
- **Dependências:** Sprint 1 concluído; confirmação de `demo-fluxo`; leitura do corpo de `finalizar_venda_transacional_canonica_v4` para confirmar que recalcula totais no servidor (A1, risco residual).
- **Arquivos afetados:** nenhum código de app previsto; possivelmente `pdv-importados/app/demo-fluxo/actions.ts` se for escrita.
- **Migrations:** 002 (revisada). 001 não aplicar.
- **Testes:** matriz `MATRIZ_TESTES_HOMOLOGACAO_FASE3.md` integralmente: venda normal, múltiplos pagamentos, desconto, cancelamento, estorno, fechamento, sync offline, reconexão, concorrência, isolamento, auditoria, regressão do PDV.
- **Critérios de aceite:** T-A1, T-A3 negativos bloqueados; todos os positivos verdes; trilha de auditoria íntegra; rollback executado e cronometrado em homologação.
- **Riscos:** quebra de fluxo não coberto pelo app (ex.: importação por script com JWT de usuário). Mitigação: inventário de chamadores REST por `pg_stat_statements` de `authenticated` antes da aplicação.
- **Estimativa:** 6–8 DP.
- **Condição de conclusão:** aplicado em produção com janela, sem regressão em 48 h e com rollback documentado.

## Sprint 3 — Perfis e feature flags: B1, C1 (3–4 DP)

- **Objetivo:** travar escrita de `perfis` e `feature_flags` para `authenticated`.
- **Escopo:** migrations 003 e 004; decisão D2 (manter ou aposentar `perfis`); decisão D3 (RPC administrativa de flags ou nenhuma).
- **Dependências:** Sprint 1. Nenhuma dependência de código (sem consumidor).
- **Testes:** T-B1-*, T-C1-*; regressão de login e de RLS de `usuarios`.
- **Critérios de aceite:** operador não altera perfil nem loja; DONO não grava flag; SELECT inalterado.
- **Riscos:** baixo. Se a tela de flags existir fora do repo, quebra. Confirmar.
- **Estimativa:** 3–4 DP.

## Sprint 4 — Performance (6–10 DP)

- **Objetivo:** reduzir latência de relatórios, status de caixa e timeouts PostgREST com medição antes/depois.
- **Escopo:**
  1. Promover `20260913090000` (fuso) após reconciliação; medir.
  2. Medir `pdv_config_flags_visuais` e `obter_status_caixa_operador` com `EXPLAIN (ANALYZE, BUFFERS)` como role `authenticated`.
  3. Consolidar multiple permissive policies e `auth.uid()` sem initplan (advisors).
  4. Índices de FK somente após medição.
- **Dependências:** Sprint 1; homologação com volume realista; reset controlado de `pg_stat_statements` em homologação.
- **Arquivos afetados:** migrations novas (a criar); possivelmente `registrarAlertasLevesVenda.ts` (chamada por venda).
- **Testes:** carga de relatório e de finalização de venda em homologação; comparação de latências.
- **Critérios de aceite:** relatório médio < 1 s em homologação; `pdv_config_flags_visuais` média < 10 ms; zero timeout PostgREST em 7 dias de baseline comparável.
- **Riscos:** índice ou policy que piora escrita (ver regra de índices do relatório).
- **Estimativa:** 6–10 DP.

## Sprint 5 — Backup e recuperação (4–6 DP)

- **Objetivo:** RPO de 24 h comprovado e RTO medido.
- **Escopo:** rotina diária com `backup-ro-postgres.sh` + `age` + SHA-256 + retenção + alerta; restauração mensal documentada; destino externo.
- **Dependências:** credencial read-only (autorização do dono), destino externo, Docker na máquina de execução.
- **Testes:** dump de ensaio restaurado em Postgres descartável com contagens iguais.
- **Critérios de aceite:** 7 dias consecutivos com sucesso e alerta testado; 1 restore completo com RTO medido e registrado.
- **Riscos:** credencial exposta; disco cheio; restauração não testada.
- **Estimativa:** 4–6 DP.

---

## Riscos transversais

- Migration aplicada em produção fora do fluxo (já ocorreu, GO-LIVE-02).
- Mudança de comportamento em RPC legada não coberta por teste.
- Backup não restaurável (sem teste mensal, o RPO é fictício).

## Decisões pendentes do dono

- D1: reabertura de caixa — manter via `retomar_caixa_atomico` com token de gerente? Precisa de tela?
- D2: `perfis` deve continuar existindo?
- D3: feature flags precisam de administração pela UI? Se sim, RPC de plataforma.
- D4: teto de `valor_inicial` na abertura de caixa (N1).
- D5: autorização para aplicar migrations em produção, por sprint.
- D6: credencial de backup e destino externo.
- D7: upgrade de plano Supabase (decisão de compra).
