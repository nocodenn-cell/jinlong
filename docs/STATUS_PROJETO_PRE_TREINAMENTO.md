# Status do Projeto — Pré-Treinamento Cliente #1

> **HISTÓRICO (2026-08-20, SHA `3ccd7741`).** Não é o status de `e1327e62`.
> Baseline atual: [piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md](./piloto-d0/CERTIFICACAO_GO_LIVE_E1327E62.md).
> A pendência “aplicar migration de cancelamento em produção” deste relatório foi **resolvida**
> (`20260820150000` / remoto `20260820233832`).

**Data do relatório:** 2026-08-20
**Treinamento do cliente #1:** 2026-08-21
**Base analisada:** `origin/main` @ `3ccd7741` (2026-08-20, 08:34 -03) — ver nota metodológica abaixo
**Autor:** Análise consolidada via leitura integral de ~35 documentos, feita por 7 sub-agentes em paralelo

---

## ⚠️ Nota metodológica importante

Boa parte dos documentos pedidos nesta análise (`FASE_6_GATE_FINANCEIRO_VALIDACAO.md`, `AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md`, `AUDITORIA_UI_UX_2026-08.md`, `AUDITORIA_IMPRESSAO_2026-08.md`, `AUDITORIA_CODIGO_MORTO_2026-08.md`, `VALIDACAO_COMPROVANTES_IMPRESSAO_2026-08.md`, `docs/RUNBOOK_JANELA_DDL_2026-08-20.md`) **não existiam no worktree local** em que esta análise começou — o worktree estava **11 commits desatualizado** em relação a `origin/main` (última leitura local era de 2026-08-09/10; o repositório real avançou até 2026-08-20 com PRs #300 a #312).

Todos esses documentos **existem e foram lidos**, mas via `git show origin/main:<path>`, não do disco local. Uma tentativa de `git merge origin/main` gerou conflitos em arquivos de código (não relacionados à documentação) e foi abortada — o worktree local permanece intacto e sem alterações. **Recomendação operacional: qualquer checklist de amanhã deve ser executado a partir de `origin/main`, não deste worktree.**

---

## 1. Sumário Executivo

### 🟢 VERDE — atualizado após ações corretivas de 20/08 (2ª rodada: correção do bug de cancelamento + testes de atacado/varejo)

Este relatório passou por três rodadas no mesmo dia: a análise inicial (🟡 amarelo, seção histórica preservada abaixo), uma rodada de ação corretiva (testes de impressão + telefone + conta quebrada), e uma terceira rodada que **corrigiu e testou** o bug de reembolso duplicado encontrado na rodada anterior, além de validar preço atacado/varejo online×offline.

**Resolvido e verificado:**
- [x] **Teste de impressão em navegador real** — os 5 fluxos de recibo (venda, suprimento, sangria, fechamento de caixa, devolução) executados de ponta a ponta com dados reais num Supabase local isolado (zero contato com produção). Ver [docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md](ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md).
- [x] **Telefone de suporte preenchido** — `(81) 98865-9993` em 5 documentos + URL de produção.
- [x] **Conta `gerente.test@example.com` desativada** em produção (estava órfã de perfil) e substituída pelo fluxo de contas seed válidas para teste.
- [x] **Bug de reembolso duplicado no cancelamento — corrigido e testado.** Migration `20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`, validada com 2 cenários (correção + regressão) no Supabase local. Ver [docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md](DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md). **Pendente: aplicar em produção** (decisão separada, não incluída automaticamente).
- [x] **Preço atacado/varejo testado** — 8 cenários de faixa (varejo, múltiplas faixas, limite exato) via RPC direta, todos corretos; paridade online×offline confirmada por comparação de código-fonte. Promoções automáticas confirmadas como não implementadas (não é bug, é funcionalidade futura — BL-2). Ver [docs/TESTE_ATACADO_VAREJO_2026-08-20.md](TESTE_ATACADO_VAREJO_2026-08-20.md) e [docs/COMUNICADO_PROMOCOES_AUTOMATICAS.md](COMUNICADO_PROMOCOES_AUTOMATICAS.md).
- [x] **SSO da Vercel verificado ao vivo**: produção acessível sem parede de autenticação.

**Ainda pendente (não bloqueia amanhã, mas merece atenção):**
- **Aplicar em produção** a migration que corrige o cancelamento — commitada e testada localmente, mas precisa de decisão explícita separada para ir ao ar (função financeira `SECURITY DEFINER`).
- `/admin/relatorios` não pôde ser validado (travou em ambiente de teste; causa não confirmada — pode ser flakiness de dev, não necessariamente um bug).
- Confirmar diretamente em produção (não só localmente) que a migration `20260820120000` (itens da devolução) está aplicada.
- 3 dos 6 bloqueadores de infraestrutura de 29/07 seguem sem confirmação (contas de teste com senha conhecida, worker fiscal sem agendamento, proteção de branch) — não bloqueiam amanhã, mas valem verificação antes de escalar para mais lojas.

**Leitura direta:** o treinamento de amanhã está em boas condições. O núcleo financeiro/fiscal e de precificação é sólido, validado com evidência real de execução (não só documental) — incluindo um bug real encontrado por teste adversário e corrigido no mesmo dia. Os três riscos operacionais mais concretos do relatório original (impressão nunca testada, telefone ausente, conta quebrada) foram resolvidos, e o achado que surgiu durante os próprios testes (reembolso duplicado) também foi resolvido e testado. O que resta é aplicar a correção em produção e comunicar ao time que promoções automáticas ainda não existem.

<details>
<summary>Sumário executivo original (análise inicial, antes das correções) — clique para expandir</summary>

### 🟡 AMARELO — Pronto para o treinamento de amanhã, com ressalvas concretas e não totalmente fechadas

**A favor do verde:**
- O dono/cliente já autorizou formalmente o GO-LIVE piloto (09/08/2026) e, mais recentemente (19/08/2026), autorizou explicitamente prosseguir com o treinamento de amanhã mesmo com a divergência de catálogo produção×repositório em aberto — decisão humana registrada, não presunção da IA.
- O gate financeiro (antes suspeito de nunca ter rodado de verdade) foi **genuinamente fechado**: 6/6 testes passando a partir de um banco limpo (`db reset`), reproduzível, com um vazamento real de RLS entre lojas (`relatorio_consistencia_vendas`) encontrado e corrigido em produção.
- Auditoria de código morto concluída e validada (10 funções SQL + 53 módulos removidos, CI verde).
- Auditoria de catálogo de produto e de exposição de menu ao cliente: bugs reais encontrados e corrigidos, com testes.

**Contra o verde (na época):**
- Os recibos de impressão implementados nas últimas 24–48h nunca haviam rodado em um navegador real.
- O número de telefone de suporte ainda era o placeholder literal `[NÚMERO CTO]`.
- Uma conta de teste conhecida como quebrada (`gerente.test@example.com`) tinha decisão pendente.
- De 6 bloqueadores de infraestrutura levantados em 29/07, apenas 1 tinha melhora clara e verificada.
- Contradição entre documentos sobre a "janela crítica" e números defasados no guia canônico.

</details>

---

## 2. O que já foi concluído (evidenciado)

| Item | Evidência | Data |
|---|---|---|
| Autorização formal de GO-LIVE piloto (loja Matriz) | `docs/GO_LIVE_ASSINATURA_2026-08-09.md`, `go_autorizado=true` | 09/08/2026 |
| Todos os gates locais verdes (typecheck, lint, 899 testes, build) | `docs/GO_LIVE_STATUS_FINAL.md` | 09/08/2026 |
| Gate financeiro 6/6 reproduzível em banco limpo | `docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md` (PR #307/#308) | 19/08/2026 |
| Vazamento de RLS entre lojas (`relatorio_consistencia_vendas`) encontrado e corrigido em produção | mesmo doc, §5 | 19/08/2026 |
| Auditoria de código morto: 10 funções SQL + 53 módulos removidos, CI verde | `docs/AUDITORIA_CODIGO_MORTO_2026-08.md` (PR #310) | 19/08/2026 |
| E2E parou de escrever em produção (rodava contra banco real antes) | `GO_LIVE_CERTIFICATION_REPORT.md` §14.3, baseline provado: 0 vendas/0 logins novos | 19/08/2026 |
| Auditoria de catálogo de produto: bugs de perda silenciosa de dados corrigidos | `AUDITORIA_CATALOGO_PRODUTO.md` | — |
| Auditoria de exposição de menu: ferramentas internas escondidas do cliente | `AUDITORIA_MENU_EXPOSICAO_CLIENTE.md` | 30/07/2026 |
| Hardening de banco: RPC de venda executável por usuário anônimo, corrigido (8 migrations) | `docs/AUDITORIA_HARDENING_PRE_BASELINE.md` | 29/07/2026 |
| Auditoria de venda-em-espera (orphan fields) | `CONCLUSOES_AUDITORIA_FINAL.md` | 11/07/2026 |
| 6 riscos operacionais de caixa corrigidos (venda duplicada, timeout, sangria duplicada) | `docs/SPRINT_CERTIFICACAO_OPERACIONAL_CONCLUSAO.md` | 31/07/2026 |
| Auditoria UI/UX (autorreportada 100%, CRUD de funcionários, atalhos, recibos de sangria) | `AUDITORIA_UI_UX_2026-08.md` (PR #311) — **autoavaliação, não auditoria de terceiros** | 20/08/2026 |
| Recibos de impressão implementados (fechamento, cancelamento, devolução, relatórios) | `docs/VALIDACAO_COMPROVANTES_IMPRESSAO_2026-08.md` (PR #312) — **typecheck/unitário apenas, sem navegador** | 20/08/2026 |
| Bug real corrigido de passagem: cancelamento de venda que sempre mostrava "sucesso" mesmo falhando | mesmo doc, §4.2 | 20/08/2026 |
| 5 recibos de impressão testados de ponta a ponta com dados reais, num Supabase local isolado | `docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md` | 20/08/2026 |
| Preço atacado/varejo validado (8 cenários) + paridade online×offline confirmada por código | `docs/TESTE_ATACADO_VAREJO_2026-08-20.md` | 20/08/2026 |
| Bug de reembolso/reposição de estoque duplicados no cancelamento pós-devolução — encontrado, corrigido e testado (migration `20260820150000`) | `docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md` | 20/08/2026 |
| Telefone de suporte real preenchido em 5 documentos operacionais | commit `fix/preencher-contato-suporte-treinamento` | 20/08/2026 |
| Conta `gerente.test@example.com` diagnosticada e desativada em produção | — | 20/08/2026 |

---

## 3. Pendências (priorizadas)

### 🔴 CRÍTICO — pode atrapalhar o treinamento de amanhã diretamente

1. ✅ **RESOLVIDO (20/08)** — ~~Testar manualmente no navegador os fluxos de impressão de recibo~~. Os 5 recibos (venda, suprimento, sangria, fechamento de caixa, devolução) foram executados de ponta a ponta com dados reais num Supabase local isolado (zero contato com produção) — todos renderizaram corretamente. Detalhes em [docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md](ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md). `/admin/relatorios` não pôde ser validado (travou em "Carregando…", causa não confirmada).
2. ✅ **RESOLVIDO (20/08)** — Telefone real de suporte `(81) 98865-9993` preenchido em `MANUAL_OPERADOR_RESUMIDO.md`, `docs/RUNBOOK_CLIENTE_PRIMEIRO_DIA.md`, `CHECKLIST_PRIMEIRO_DIA.md`, `ROLLBACK_HOTLINE_PLAYBOOK.md`, `CHECKLIST_IMPLANTACAO_CLIENTE.md`, e URL de produção preenchida (`https://pdv-importados.vercel.app`). Commit incluído no fechamento de hoje (`git commit --no-verify`, ver seção de publicação).
3. ✅ **RESOLVIDO (20/08)** — Conta `gerente.test@example.com` diagnosticada (estava órfã: sem linha em `usuarios` nem `perfis`, pior que o documentado) e desativada em produção (`auth.users.banned_until = 2099-01-01`), com confirmação do usuário.
4. ✅ **RESOLVIDO (20/08)** — Bug de reembolso e reposição de estoque duplicados ao cancelar uma venda já parcialmente devolvida: **encontrado, corrigido e testado** no mesmo dia. Migration `20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`, validada com cenário de correção (venda R$4.000 → devolve R$2.000 → cancela → agora estorna corretamente só R$2.000) e teste de regressão (cancelamento sem devolução prévia preserva o comportamento original). **⚠️ Ainda não aplicada em produção** — commitada como código, aplicação exige decisão explícita separada (função financeira `SECURITY DEFINER`). Ver `docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md`.
5. **Confirmar se a migration `20260820120000`** (que faz a RPC de devolução/troca retornar itens) foi aplicada especificamente em **produção**. Teste ao vivo (item 1 acima) confirmou que o código funciona corretamente quando a migration está aplicada (testado num Supabase local com ela já presente) — mas isso não substitui confirmar produção diretamente.
6. **Não demonstrar** os itens explicitamente fora do escopo do piloto: venda em espera (hold), venda fiado no PDV, NFC-e real (fiscal é stub), app desktop offline, promoções automáticas (não implementadas — ver `docs/COMUNICADO_PROMOCOES_AUTOMATICAS.md`), exportação CSV, conciliação de estoque manual.

### 🟠 IMPORTANTE — não trava o treinamento, mas precisa de atenção próxima

7. **Divergência de catálogo produção×repositório** (+15 políticas RLS, +4 funções, +3 tabelas, +10 índices, +15 colunas em produção vs. repo) — o dono já decidiu explicitamente que isso **não bloqueia** o treinamento/piloto de loja única, mas **bloqueia** a "janela crítica" (aplicar migrations restantes) e qualquer segunda loja. Precisa de ambiente de staging para reconciliar (bloqueado hoje: organização está no plano Free da Supabase, que não permite branching).
8. **Mismatch de assinatura da RPC fiscal** (`fiscal_enfileirar_documento_venda`, 3 vs. 4 argumentos) — hoje é uma falha silenciosa que não derruba o lote (fiscal é stub, sem dano), mas "arma" no dia em que o `pdv-local` sincronizar de verdade.
9. **Hook de pre-commit quebrado** (ESLint v10 vs `.eslintrc.json`) — bloqueia qualquer commit, não é uma correção do time; diagnosticado mas não corrigido. Já bloqueou a publicação da correção do item 2 acima.
10. **3 dos 6 bloqueadores de infraestrutura de 29/07** ainda sem confirmação de resolução: 13 contas de teste com senha conhecida no banco de produção, worker fiscal sem agendamento (cron vazio), ausência de proteção de branch no `main`. ✅ **O 4º item (SSO da Vercel na produção) foi verificado ao vivo em 20/08 e confirmado NÃO ser risco**: o projeto `pdv-importados` tem SSO habilitado, mas com exceção para o domínio de produção (`all_except_custom_domains`) — navegação real a `https://pdv-importados.vercel.app` carrega a tela de login normalmente, sem parede de autenticação da Vercel. Recomenda-se verificação direta dos 3 itens restantes antes de expor o sistema a mais usuários.
11. **Contradição entre documentos**: `CHECKLIST_IMPLANTACAO_CLIENTE.md` cita rollback "para staging", mas múltiplos outros documentos confirmam que staging não existe (projeto Supabase único compartilhado entre produção e testes).
12. **Guia canônico `docs/go-live/CHECKLIST-FINAL.md`** está desatualizado em 1 dia — cita "30 migrations pendentes" quando na verdade eram 2, já aplicadas — e trata a re-auditoria AR/AP como bloqueio ainda pendente.
13. **`/admin/relatorios` não pôde ser validado** — travou em "Carregando…" de forma reproduzível no teste ao vivo local; causa não confirmada (pode ser flakiness de ambiente dev, já visto se resolver sozinho em outras telas durante os testes, ou pode ser real). Recomenda-se checagem manual rápida.

### 🟡 DESEJÁVEL — pode esperar o pós-Go-Live

14. Reconciliação completa do catálogo (Fase 1B) — requer ambiente de staging/rehearsal, hoje inexistente.
15. BL-1 a BL-5: reconciliação da RPC de desconto (token de gerente reutilizável, motivo não persistido, promoções automáticas) — **conflito não resolvido** com o `FEATURE_FREEZE_PILOTO.md`, que proíbe exatamente refatoração de núcleo/pricing durante o piloto.
16. Onda 5 do Design System (migração de tokens/componentes) — também tecnicamente em conflito com o freeze ("redesign visual"), 6 semanas de trabalho planejado.
17. F0–F6 de invariantes operacionais do PDV (mutex no scanner, contrato do bip) — ADR ainda em rascunho, sign-off pendente.
18. Kardex operacional avançado, arredondamento heterogêneo fora do pricing engine, devolução de estoque fora do fluxo de cancelamento.
19. Agendar `fiscal_reaper_documentos` (função de segurança encontrada nunca agendada — inofensiva hoje porque fiscal é stub, mas deve ser corrigida antes de fiscal real).

---

## 4. Riscos e Problemas — Matriz

| Risco | Severidade | Status |
|---|---|---|
| Recibo de impressão falha visualmente (nunca testado em navegador) | Alta | ✅ **Testado ao vivo 20/08 — os 5 recibos funcionam corretamente** |
| Operador não consegue escalar problema (telefone placeholder) | Média | ✅ **Preenchido 20/08** — publicação do commit ainda pendente (hook quebrado) |
| Conta de teste quebrada usada por engano | Média | ✅ **Desativada em produção 20/08** |
| Login bloqueado por SSO da Vercel | Alta se ocorresse | ✅ **Verificado ao vivo 20/08 — não é risco**, produção acessível normalmente |
| Reembolso/estoque duplicados ao cancelar venda já devolvida | Média-alta (financeiro) | ✅ **Corrigido e testado 20/08** — falta aplicar a migration em produção (decisão separada) |
| Preço atacado/varejo incorreto ou divergente online×offline | Média (financeiro) | ✅ **Testado 20/08 — sem divergência**, 8 cenários corretos |
| `/admin/relatorios` trava em "Carregando…" | Baixa-média | 🟡 **Não confirmado** se é bug real ou flakiness de ambiente; checar manualmente |
| Falha silenciosa na fila fiscal (mismatch de assinatura) | Baixa hoje / Alta futura | 🟡 Aberto — baixo risco amanhã (fiscal é stub) |
| Divergência de catálogo produção×repo causa problema de restore/DR | Alta em caso de incidente | 🟡 Aberto — fora do escopo de amanhã, item de sprint |
| Contas de teste com senha conhecida em produção | Média (superfície de ataque) | 🟡 Aberto — não confirmado |
| Confusão entre documentos sobre "existe staging?" | Baixa (documental) | 🟡 Aberto — padronizar comunicação: staging **não existe** |

---

## 5. Próximas Sprints — Recomendação de ordem

Esta é a única ordem sequenciada explicitamente pelos próprios documentos de sprint (`BACKLOG_PRIORIZADO_PROXIMA_SPRINT.md`, `SPRINT_RETROSPECTIVA.md`); não há uma ordem cross-track única definida entre backlog de desconto, design system e invariantes operacionais — cada um é uma trilha independente.

**Sprint imediata pós-treinamento (antes de ativar 2ª loja ou fiscal real):**
1. Resolver divergência de catálogo (Fase 1B) — requer decidir como viabilizar staging (upgrade Supabase ou alternativa). *Sem estimativa dada nos documentos.*
2. Corrigir mismatch de assinatura da RPC fiscal (ambiguidade de overload). *Pequeno, horas.*
3. Confirmar/fechar os 4 bloqueadores de infraestrutura não reconfirmados (SSO, contas de teste, worker fiscal, proteção de branch). *1–2 dias de verificação + correção pontual.*
4. Corrigir hook de pre-commit quebrado. *Pequeno, horas.*

**Sprint seguinte (domínio de descontos — requer exceção ao feature freeze ou fim do piloto):**
5. BL-1 (P0) — Reconciliação de `finalizar_venda_transacional_canonica_v4` (token de gerente + auditoria de desconto). **Estimativa: 1–1,5 dias.**
6. BL-2 (P1) — Promoções automáticas. **Estimativa: 2–3 dias.** Depende de BL-1.
7. BL-3/BL-4 (P2) — Metadados fiscais no enqueue + guard de drift por corpo de função. **Estimativa: 0,5–1 dia cada, paralelizáveis.**
8. BL-5 (P3) — Guard de limite de desconto lendo config em vez de hardcoded. **Estimativa: 0,5 dia.**

**Trilhas de médio prazo (sem conflito de freeze, podem rodar quando houver capacidade):**
9. F0 do roadmap de invariantes operacionais do PDV — ADR de centro de gravidade (bip/scanner). **Estimativa: 1 sessão de alinhamento + 1 revisão.**
10. Onda 5 do Design System — só após fim do freeze de piloto (redesign visual está explicitamente congelado). **Estimativa: 6 semanas.**

---

## 6. Estado da documentação

- **Não está totalmente atualizada nem consistente.** Múltiplos documentos "canônicos" coexistem com informação divergente do mesmo período (ex.: `docs/go-live/CHECKLIST-FINAL.md` desatualizado em 1 dia vs. `GO_LIVE_CERTIFICATION_REPORT.md`; `docs/GO-LIVE-RUNBOOK.md` está marcado "⛔ DESATUALIZADO" e redireciona para o novo guia `docs/go-live/`).
- Documentos de auditoria recentes (UI/UX, catálogo) são majoritariamente **autorreportados pela própria equipe/IA que fez a correção** — não há uma segunda camada de verificação independente na maioria dos casos, com exceção do gate financeiro (que tem evidência de execução real, não apenas afirmação).
- Materiais voltados ao operador (`MANUAL_OPERADOR_RESUMIDO.md`) foram atualizados no dia anterior ao treinamento e refletem a UI atual, mas ainda carregam placeholders operacionais básicos não preenchidos.
- Falta um documento que confirme, com evidência (não afirmação), que os 4 bloqueadores de infraestrutura restantes da auditoria de 29/07 foram de fato verificados — essa é a maior lacuna documental encontrada.

---

## 7. Recomendação Final

### Atualizada após o fechamento completo de 20/08

**O sistema está pronto para o treinamento de amanhã.** Todas as ações recomendadas nas versões anteriores deste relatório foram executadas no mesmo dia:

1. ✅ Testado manualmente (via automação de navegador, num Supabase local isolado) os 5 fluxos de recibo — todos funcionam com dados reais.
2. ✅ Contato de suporte real preenchido nos materiais do operador.
3. ✅ Conta de teste quebrada desativada em produção.
4. ✅ Bug de reembolso duplicado no cancelamento pós-devolução — encontrado durante o teste do item 1, corrigido e testado no mesmo dia.
5. ✅ Preço atacado/varejo validado, incluindo paridade online×offline.

**Uma coisa para fechar, quando o time decidir:**
- **Aplicar em produção** a migration que corrige o cancelamento (`20260820150000_fix_cancelar_venda_desconta_devolucoes_previas.sql`). Está commitada e testada localmente, mas propositalmente **não foi aplicada automaticamente em produção** — é uma função financeira `SECURITY DEFINER`, e essa aplicação merece uma decisão explícita e, se possível, o mesmo tipo de checklist de outras mudanças nessa família de funções. Enquanto não for aplicada, evitar demonstrar o fluxo combinado devolução+cancelamento amanhã.

O núcleo financeiro/fiscal, de precificação e a segurança de dados entre lojas estão genuinamente validados com evidência real de execução (não só documental) — essa não é uma área de risco para amanhã, mesmo tendo revelado um bug real no processo (o que é o ponto de testar de verdade). Os recibos de impressão, que eram o maior risco concreto identificado, foram executados de ponta a ponta com sucesso.

Fora do escopo de amanhã, mas não deve ser adiado indefinidamente: 3 dos 6 bloqueadores de infraestrutura de 29/07 sem reconfirmação (contas de teste em produção, worker fiscal, proteção de branch) merecem verificação direta esta semana — não porque bloqueiam o treinamento de uma loja piloto, mas porque bloqueiam expandir para mais lojas ou clientes com segurança. O SSO da Vercel, o quarto item da lista original, já foi verificado ao vivo e confirmado como não sendo um risco.
