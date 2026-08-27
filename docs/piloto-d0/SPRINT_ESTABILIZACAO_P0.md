# Sprint — Estabilização Operacional do Piloto (P0)

**Status:** plano oficial. P0-2 **FAIL** — [P0-2_BACKUP_EVIDENCIA.md](./P0-2_BACKUP_EVIDENCIA.md). P0-3 **parado no human gate** — [P0-3_HUMAN_GATE.md](./P0-3_HUMAN_GATE.md). Nenhuma operação destrutiva executada.

| Campo | Valor |
|---|---|
| **Produto (release)** | `e1327e62` |
| **main após #331** | `99e52de7` (só docs em cima da release) |
| **Objetivo** | Se amanhã a cliente operar e ocorrer um problema, sabemos detectar, diagnosticar, recuperar e preservar os dados |
| **Fora** | Fiscal, WhatsApp, Fase 1B, cosmética, refatoração, Playwright “ficar verde” |

P1 (permissões remotas, Sentry ponta a ponta, drift Git↔prod, reconciliação de um dia) **só depois** de P0 PASS ou human gate explícito.

Fontes já existentes (não reescrever): [CHECKLIST_PILOTO_CLIENTE_2026-08-24.md](../../CHECKLIST_PILOTO_CLIENTE_2026-08-24.md), [ROLLBACK_HOTLINE_PLAYBOOK.md](../../ROLLBACK_HOTLINE_PLAYBOOK.md), `backup.sh`, [go-live/10-troubleshooting.md](../go-live/10-troubleshooting.md).

---

## Regras desta sprint

1. Não alterar produto para satisfazer teste.
2. Restore **nunca** aponta para o projeto Jinlong de produção (`kbabmewnahysfvlybiak`).
3. Dump/PITR de produção, se houver, só leitura + restore em **projeto temporário** a destruir.
4. Presença física na loja só onde o periférico/rede da cliente é a variável.
5. Playwright completo: não tocar. Só se houver causa raiz **reproduzível** distinta de flake/infra já classificada.

---

## P0-1 — Smoke na máquina/ambiente real da cliente

| | |
|---|---|
| **Procedimento** | Executar o [checklist presencial](../../CHECKLIST_PILOTO_CLIENTE_2026-08-24.md) contra `https://pdv-importados.vercel.app` (ou o host que a loja usa). Ciclo mínimo: login operador → abrir caixa → varejo → atacado → dinheiro (troco) → PIX → débito → crédito → comprovante → cancelamento de **venda de teste** (se autorizado) → fechar caixa → F5 e conferir histórico. Gerente confirma a venda em `/admin/vendas`. IDs anotados, sem PII no Git. |
| **Risco** | Dados de teste no banco de produção (vendas/caixa reais da Matriz). Mitigar: SKUs/caixa de prova combinados; cancelar vendas de teste pelo fluxo auditado; não usar dinheiro real do cliente. |
| **Evidência** | Checklist assinado (foto/PDF fora do Git); IDs de venda/caixa; horário; browser/OS; se o leitor/impressora funcionaram. |
| **Rollback** | Cancelar vendas de prova; fechar caixa de teste; não apagar linhas. |
| **PASS** | Todos os itens 1–9 do checklist presencial marcados, ou falha **classificada** (rede/periférico/produto) com ID. |
| **FAIL** | Fluxo D0 quebrado de forma reproduzível (venda não grava, estoque não baixa, troco em PIX, etc.). Aí vira hotfix — não P1. |
| **Presença na loja** | **Sim**, se o piloto usa leitor/impressora/rede da loja. **Não** se o aceite for só “mesmo browser em VPN da loja” — nesse caso registrar a limitação. |

---

## P0-2 — Identificar e provar o mecanismo atual de backup

| | |
|---|---|
| **Procedimento** | No painel Supabase do projeto Jinlong: plano, backups automáticos, PITR (ligado ou não), retenção, região. Conferir se `backup.sh` (pg_dump `-Fc`) **está agendado em algum lugar** ou é só artefato de repo (hipótese atual: **não agendado**). Anotar o que o provedor garante vs o que o repo promete. D0-06: meta 24h/8h **não é SLA**. |
| **Risco** | Nenhum de escrita se for só leitura do painel. Não copiar connection strings para o Git. |
| **Evidência** | Captura do painel (retenção/PITR) sanitizada; uma linha: “mecanismo = X; `backup.sh` = Y”. |
| **Rollback** | N/A (somente leitura). |
| **PASS** | Mecanismo nomeado, retenção conhecida, dono sabe que **não** é backup local+nuvem diário/semanal/mensal da especificação. |
| **FAIL** | Não há backup identificável e o dono não aceita o risco por escrito. |
| **Presença na loja** | **Não.** |

---

## P0-3 — Restore controlado em ambiente temporário

| | |
|---|---|
| **Procedimento** | 1) Criar **projeto Supabase novo** (ou dump restaurado só nesse projeto). 2) Restaurar o backup identificado em P0-2 (`pg_restore` de dump **ou** fluxo oficial de restore/PITR do painel para o temporário). 3) Contar `vendas`, `produtos`, `estoque` (agregados) e comparar ordem de grandeza com produção **sem** copiar PII para o repo. 4) Cronometrar. 5) **Destruir** o projeto temporário. **Proibido:** `db reset` em produção; apontar Vercel de produção para o temporário; merge de branch Supabase no Jinlong. |
| **Risco** | Alto se alguém restaurar **em cima** de produção. Mitigar: outro `project ref`; checklist de dois operadores (executa/confere); nenhuma env de produção alterada. |
| **Evidência** | Timestamps início/fim (RTO); tipo de restore; contagens agregadas; confirmação de destroy. |
| **Rollback** | Se o temporário falhar: destruir e parar. Produção intocada. Se (erro humano) produção for atingida: **parar a sprint**, hotline, não improvisar. |
| **PASS** | Restore conclui; integridade agregada conferida; RPO/RTO registrados vs meta 24h/8h (desvio explícito se houver). |
| **FAIL** | Restore impossível com o mecanismo atual **e** dono não assina human gate “operar sem restore ensaiado”. |
| **Presença na loja** | **Não.** |

**Human gate:** branching Supabase exigiu plano Pro e foi recusado historicamente. Se PITR/clone não existir no plano atual, o PASS pode ser: dump lógico para temporário **ou** aceite escrito. Não inventar PITR.

---

## P0-4 — Runbook de uma página (incidente/recuperação)

| | |
|---|---|
| **Procedimento** | Redigir **uma** página em `docs/piloto-d0/RUNBOOK_INCIDENTE_1_PAGINA.md` com: (1) detectar (`/api/health`, Vercel, Sentry, status Supabase); (2) diagnosticar (tabela do hotline, sem URLs mortas — o playbook ainda cita `jinlong-v1.vercel.app`); (3) preservar dados (não `db reset`, não reaplicar tombstones); (4) recuperar app (rollback Vercel **coordenado** com banco); (5) recuperar dados (apontar para o mecanismo **provado** em P0-2/P0-3); (6) telefone de suporte já documentado. Enxugar; não duplicar os 12 arquivos de `docs/go-live/`. |
| **Risco** | Runbook mentiroso (prometer PITR se P0-2 mostrou que não há). Só escrever o que P0-2/3 provaram. |
| **Evidência** | Arquivo mergeado; revisão de uma pessoa que não escreveu. |
| **Rollback** | Reverter o commit do runbook. |
| **PASS** | Ops consegue seguir o incidente caixa/estoque/deploy sem abrir 12 docs. Conteúdo coerente com P0-2/3. |
| **FAIL** | Página genérica ou contradiz o mecanismo real de backup. |
| **Presença na loja** | **Não** para redigir. **Útil** validar o telefone/roteiro com o gerente na P0-1. |

Ordem sugerida: **P0-2 → P0-3 → P0-4**, com **P0-1 em paralelo** (agenda da loja).

---

## O que esta branch **não** faz

- Não executa restore, dump, `db reset`, drop de projeto Jinlong.
- Não muda RLS, Sentry, CI Playwright, Fiscal, WhatsApp.
- Não implementa P1.

## Definition of Done (P0)

Igual a [PROXIMA_SPRINT.md](./PROXIMA_SPRINT.md): evidências P0-1…4 anexadas ou human gate datado; zero feature nova.
