# Próxima sprint — após `e1327e62`

**Status:** proposta. **Não iniciar implementação** até aceite humano desta recomendação.

Baseline: [CERTIFICACAO_GO_LIVE_E1327E62.md](./CERTIFICACAO_GO_LIVE_E1327E62.md) · decisão **GO**.

Prioridade usada (missão 2026-08-27): (1) risco operacional do piloto → (2) integridade dos dados → (3) recuperação → (4) dinheiro/caixa → (5) estoque → (6) permissões → (7) observabilidade → (8) UX operacional → (9) features novas.

---

## Por que Fiscal **não** é a próxima sprint

- D0-09: fiscal é **stub honesto**; Focus exige contrato, certificado, CSC e fase própria (`EXT-D0-001`).
- `fiscal_reaper_documentos` nunca agendada — arma **junto com fiscal real**, não com o piloto web.
- Assinatura `fiscal_enfileirar_documento_venda` 3 vs 4 args quebra o caminho **desktop**, fora do D0.
- Implementar NFC-e agora fura a fila à frente de restore nunca testado, smoke na máquina da cliente e drift Git↔prod.

## Por que WhatsApp **não** é a próxima sprint

- D0-08 / DIV-D0-010: LGPD, provedor, consentimento, custo. Ausente no código. Feature nova (prioridade 9).

## Por que não “deixar o Playwright completo verde”

- Classificado C/D/E. Alterar produto para satisfazer seletor/timeout da suíte de 46 min **viola** a regra da certificação.
- E2E crítico já passou. Higiene de harness pode ser P2 **dentro** da sprint recomendada, não o tema.

## Hipótese do sponsor

“Estabilização operacional do piloto” (smoke cliente, backup/restore, observabilidade, flakes, RLS, caixa, kardex, runbook).

**Validada:** é a de maior valor. O GO certificou **código + produção alinhados**. O que falta para o Jinlong **operar com segurança** é prova na loja e capacidade de recuperar dados — não uma feature.

A única rival de peso é a reconciliação de catálogo Git↔prod (Fase 1B). Ela é integridade/DR, mas exige janela DDL, plano Pro para branch Supabase (recusado) e aceite do dono. Não reduz o risco **desta semana** na loja tanto quanto smoke + restore.

---

## Três candidatas

### 1 — Estabilização operacional do piloto (recomendação)

**Problema:** o piloto está em `e1327e62` sem prova na máquina da cliente, sem restore cronometrado e sem runbook de incidente usável no D0.

**Evidências:** BL-D0-008, BL-D0-009, EXT-D0-003/004, PV-020–023, D0-06, `backup.sh` nunca exercitado em restore; GO explícito de que isso **não** estava no critério de merge.

**Escopo:** smoke autenticado na loja; identificar backup Supabase; restore em projeto temporário; registrar RPO/RTO; runbook de incidente; prova mínima de alerta (Sentry); matriz negativa de permissões **no remoto** (leitura); documentar restrição de DR (Git ≠ prod) sem reconciliar o catálogo inteiro.

**Fora:** Fiscal Focus, WhatsApp, orçamentos, Playwright “100% verde”, Fase 1B completa, novos relatórios, upgrades de deps (#290).

**Valor:** reduz o único conjunto de riscos que ainda pode **parar a loja** sem ter plano.

**Risco de não fazer:** incidente sem restore conhecido; periférico/rede só descobertos no caixa aberto.

**Complexidade:** baixa–média (operação + evidência). Pouco código; nada de schema salvo hotfix comprovado.

**Dependências:** acesso loja/impressora; projeto temporário Supabase; canal de alerta.

**Done:** ver § Definition of Done abaixo.

### 2 — Integridade Git ↔ produção (Fase 1B)

**Problema:** `db reset` a partir do Git não reproduz produção (policies, funções, tabelas extras). Disaster recovery pelo repositório entrega outro banco.

**Evidências:** BACKLOG_TECNICO 10–16; auditoria catálogo 2026-08; `create_branch` recusado (plano Free).

**Escopo:** inventário objeto a objeto; decisões de o que puxar para o Git vs o que dropar em prod; **não** aplicar DDL sem janela e aceite.

**Fora:** features; fiscal real; E2E.

**Valor:** alto para a **segunda** loja e para rebuild. Médio para a loja que já roda.

**Risco de não fazer:** DR pelo Git continua mentindo; segunda loja herda o drift.

**Complexidade:** alta; human gate de plano/branching.

**Dependências:** aceite dono; possivelmente upgrade Pro ou dump/restore manual.

**Done:** baseline documentada; zero objeto crítico “só em prod” sem dono; script de restore ensaiado **ou** decisão escrita de não ensaiar ainda.

### 3 — Fechamento das provas D0 de dinheiro e estoque

**Problema:** equações D0-10 (vendas=pagamentos, caixa, kardex) não foram fechadas em dataset controlado na loja.

**Evidências:** BL-D0-006; PV-014–017; kardex de devolução já **corrigido no código** (#313) mas sem prova operacional ponta a ponta.

**Escopo:** dataset; SQL+tela+export; custo `NULL` (BL-D0-002); stub fiscal visual (BL-D0-005).

**Fora:** novos relatórios ABC; AP/AR repair histórico.

**Valor:** confiança nos números do gerente.

**Risco de não fazer:** decisão comercial com relatório errado.

**Complexidade:** média (precisa ambiente e tempo de gerente).

**Dependências:** loja com movimento real ou homologação dedicada.

**Done:** PV-014–017 (e PV-003 se custo NULL) com evidência anexada.

---

## Ranking

1. **Estabilização operacional do piloto**
2. Integridade Git ↔ produção (Fase 1B)
3. Provas D0 dinheiro/estoque

---

## Recomendação

**Próxima sprint: Estabilização operacional do piloto.**

Por quê: o maior risco **depois** de um GO de código não é feature — é operar sem saber restaurar e sem ter visto o caixa na máquina real.

Por que não as outras agora: Fase 1B é o item certo **depois** de haver evidência de backup/restore (senão reconcilia-se schema sem saber recuperar). Provas financeiras são P1 da **mesma** sprint se o smoke da loja sobrar tempo; não justificam sprint própria enquanto restore e máquina da cliente estão abertos.

---

## Backlog proposto (só desta sprint)

### P0

| Item | Objetivo | Evidência que falta | Aceite | Testes |
|---|---|---|---|---|
| P0-SMOKE-LOJA | Ciclo cadastro→entrada→venda→cancelamento→fechamento na máquina/browser da cliente | EXT-D0-004, BL-D0-008, PV-007–011, PV-022 | Checklist assinado com IDs (sem PII) | Manual assistido; não Playwright completo |
| P0-BACKUP | Identificar backup do projeto Jinlong (retenção, PITR se houver) | EXT-D0-003, D0-06 | Screenshot/painel + política escrita “não é SLA” | N/A |
| P0-RESTORE | Restaurar cópia em projeto **temporário**, conferir contagens, cronometrar | PV-020, BL-D0-009 | RPO/RTO registrados vs meta 24h/8h | Script + log; destruir o temporário |
| P0-RUNBOOK | Um runbook de incidente de 1 página (caixa, estoque, deploy, rollback app+banco) | docs/go-live/10 + 07 dispersos | Ops consegue seguir sem abrir 12 arquivos | Revisão humana |

### P1

| Item | Objetivo | Evidência | Aceite | Testes |
|---|---|---|---|---|
| P1-PERM | Matriz negativa OPERADOR vs GERENTE no schema **remoto** | BL-D0-010, PV-013 | Operador não cria produto / não fecha caixa alheio / não lê outra loja | SQL/RPC + 1 smoke UI |
| P1-ALERTA | Erro proposital chega ao Sentry e alguém recebe | D0-OBS-001, PV-021 | Link do evento + horário | 1 fault injection |
| P1-DRIFT-DOC | Uma página: o que Git **não** reproduz (policies/funções só em prod) | BACKLOG 10–11 | Release manager sabe que DR ≠ `db reset` | N/A |
| P1-RECON-MIN | Um dia de loja: vendas=pagamentos e caixa esperado×contado | BL-D0-006 | Equação fecha ou divergência justificada | SQL + fechamento |

### P2 (só se P0 fechado)

| Item | Objetivo | Evidência | Aceite | Testes |
|---|---|---|---|---|
| P2-E2E-HARNESS | Reduzir flake WebKit `goto`/`dcl` **sem** mudar produto | run 33073971889 classe C/E | E2E crítico continua PASS; suíte completa não é gate | Playwright harness |
| P2-CUSTO-NULL | Round-trip UI preserva `NULL` | BL-D0-002 | PV-003 | Unit + 1 E2E form |
| P2-STUB-UI | Auditoria visual: stub sem chave/DANFE | BL-D0-005 | Screenshots | Snapshot UI |
| P2-#290 | Bump `paths-filter` | PR 290 | CI verde | workflow |

---

## Definition of Done desta sprint

A sprint **encerra** quando **todos** os P0 tiverem evidência anexada (PR documental ou pasta de evidências), **e**:

1. P0-SMOKE-LOJA: pelo menos um ciclo completo na máquina da cliente, ou bloqueio **escrito** do cliente (acesso recusado) com data de reagendamento.
2. P0-RESTORE: restore executado **ou** aceite formal do dono de operar sem restore ensaiado (human gate explícito).
3. P0-RUNBOOK: mergeado em `docs/` apontando para `e1327e62`.
4. Nenhum P0 virou feature nova (Fiscal/WhatsApp/relatório ABC).
5. Se aparecer regressão D0 **reproduzível**, a sprint para e vira hotfix — não “completa o backlog P2”.

Não exigir Playwright completo verde. Não exigir Fase 1B aplicada. Não exigir Focus.

---

## Princípios de engenharia (recomendação)

| Pergunta | Estabilização | Fase 1B agora | Fiscal agora |
|---|---|---|---|
| Resolve problema real? | sim (operar/recuperar) | sim (DR futuro) | não para o piloto desta semana |
| Evidência? | BL/PV/D0-06 | auditoria catálogo | D0-09 adia |
| Controla complexidade? | sim (pouco código) | não (schema amplo) | não |
| Preserva arquitetura/SSOT? | sim | sim se bem fatiada | risco de fingir NFC-e |
| Testabilidade? | provas manuais + SQL | difícil sem branch | exige homologação SEFAZ |
| Observabilidade? | P1-ALERTA | pouco | pouco |
| Risco operacional? | reduz | reduz DR, não o D0 da loja | aumenta (compliance) |
| Incremental/reversível? | sim | DDL pouco reversível | não |
| Alternativa mais simples? | **esta é a simples** | dump documentado | permanecer stub |

Regras `.cursor` / SonarQube do repo continuam a autoridade local: os “Princípios-de-Engenharia.txt” **não estão no Git**.
