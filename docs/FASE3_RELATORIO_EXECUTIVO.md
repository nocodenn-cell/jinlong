# Fase 3 — Relatório executivo

Data: 2026-11-05. Produção não alterada. Nenhuma migration aplicada. Detalhes em `docs/security/`, `docs/performance/`, `docs/backup/` e `docs/roadmap/`.

## Situação atual

- O repositório **está acessível** (o relatório anterior dizia 403). Branch `claude/jinlong-fase3-remediation-plan-15a1d1`, HEAD `1153c962`.
- O PDV escreve venda por RPC transacional. Não há escrita direta de venda, item ou pagamento no código do app. A sincronização offline usa Edge Function com service role e RPC.
- Produção tem policies e grants de escrita direta que permitem o que o relatório descreveu (A1, A3, B1, C1).
- **Divergência de migrations:** repo e ledger de produção não batem. Qualquer aplicação depende de reconciliação.

## Vulnerabilidades

| ID | Situação em produção | Prioridade |
|---|---|---|
| **A1** | Confirmada no catálogo. Operador insere venda e pagamento DINHEIRO direto; o saldo é creditado por trigger. Exploração não testada em produção. | P1 |
| **A2** | **Mitigada** por `trg_caixas_fechado_imutavel` (ativo em produção). Não reproduz. Migration 001 é redundante. | Resolvida |
| **A3** | Confirmada. Gerente altera/exclui venda, item, pagamento e desconto direto; exclusão não é auditada. | P1 |
| **B1** | Confirmada no catálogo (`perfis_update_policy` sem restrição de coluna + grant). Impacto atual baixo: sem consumidor no app. Produção tem 3 linhas, não 0. | P2 |
| **C1** | Confirmada. DONO/ADMIN de qualquer empresa grava flags globais. Sem consumidor de escrita no app. | P2 |

## Riscos prioritários

1. **A1 — manipulação de caixa.** Venda forjada em dinheiro pode encobrir falta no fechamento (inferência do código de fechamento).
2. **A3 — exclusão de venda sem trilha.** Não há auditoria em DELETE de `vendas`.
3. **Backup sem RPO comprovado.** Plano Free, sem PITR; rotina não comprovada.
4. **Timeouts PostgREST** (~45 nas últimas 24 h). Causa parcial identificada: relatórios com `pg_timezone_names`, cuja correção existe no repo e **não está em produção**.
5. **N2 — comando Tauri de sync simulado** marca venda como enviada sem enviar. Não é chamado pela UI, mas está registrado.

## Problemas inconclusivos

- Causa exata dos timeouts (medição de EXPLAIN pendente).
- Locks e conexões (`pg_stat_activity` não consultado).
- Demo (`app/demo-fluxo`) escreve em `vendas`? Não verificado.
- Regra de teto para `valor_inicial` na abertura de caixa (N1).
- Impacto real de A1 no fechamento (teste em homologação pendente).

## Causas-raízes

- **A1/A3:** grants de tabela para `authenticated` e policies de escrita herdadas de versões antigas. As RPCs de venda já são corretas; a escrita direta sobrou.
- **B1/C1:** policies de auto-serviço e de administração sem restrição de coluna/escopo.
- **Performance:** função de validação de fuso com `pg_timezone_names` (745 ms por conexão nova), não promovida; RLS e lock em funções de caixa (hipótese).
- **Backup:** scripts existem, mas sem agendamento, alerta, destino externo ou restauração periódica comprovados.

## Plano de correção (resumo)

| Sprint | Conteúdo | Migrations |
|---|---|---|
| 1 | Reconciliar ledger; validar 001–004 no repo | Nenhuma |
| 2 | A1, A3 (002 revisada); matriz completa de PDV | 002 |
| 3 | B1, C1 | 003, 004 |
| 4 | Performance: fuso, medições, policies | Migration nova de fuso e otimizações |
| 5 | Backup diário, restauração, RPO/RTO | Nenhuma (operacional) |

**001 não aplicar.** Ver `docs/security/PLANO_REMEDIACAO_VULNERABILIDADES.md`.

## Sequência recomendada

1. Reconciliar migrations (Sprint 1).
2. Backup manual antes de qualquer migration (autorização).
3. Homologar 003 e 004; aplicar em produção após aprovação.
4. Homologar 002 com a matriz completa; aplicar com janela.
5. Performance com medição antes/depois.
6. Backup automatizado e teste de restauração.

## Dependências

- Reconciliação de ledger antes de qualquer `apply`.
- Confirmação de `demo-fluxo` e de scripts de importação antes de 002.
- Decisões de negócio D1–D7 (ver roadmap).

## Autorizações necessárias

- Aplicar migrations em produção (por sprint).
- Criar credencial read-only de backup e escolher destino externo.
- Confirmar plano Supabase e backups automáticos no painel.
- Decisões de produto: reabertura de caixa, `perfis`, feature flags, teto de `valor_inicial`.
- Upgrade de plano, se o usuário optar por PITR (compra é do usuário).

## Riscos de não agir

- Venda forjada pode ocultar desvio de caixa.
- Venda ou pagamento pode ser alterado ou excluído sem trilha, com impacto fiscal e de comissão.
- Sem backup comprovado, uma perda de dados pode ser irrecuperável.
- Timeouts degradam o PDV no horário de pico.

## Critérios para considerar o Jinlong seguro e estável

1. A1, A3, B1 e C1 negados por teste em homologação e em produção (leitura do catálogo).
2. Matriz de testes 100% aprovada, com evidência, incluindo rollback testado.
3. Zero escrita de venda, pagamento ou caixa sem trilha de auditoria.
4. Relatórios em média < 1 s e zero timeout PostgREST por 7 dias.
5. Backup diário com alerta, SHA-256 e restauração mensal bem-sucedida, com RPO de 24 h e RTO medido.
6. Ledger de migrations reconciliado com o repositório.
