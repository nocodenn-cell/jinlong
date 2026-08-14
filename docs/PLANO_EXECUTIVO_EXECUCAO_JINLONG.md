# Plano Executivo de Execução — Jinlong ERP até o Primeiro Cliente em Produção

> **Papel:** Program Manager Técnico · **Data:** 2026-07-08
> **Fontes de verdade:** `docs/GOVERNANCA_PMO_JINLONG.md` (matriz de cobertura, gaps, priorização), `docs/ROADMAP.md`, `docs/BACKLOG_TECNICO.md`, checklists operacionais (`P0_CHECKLIST_OPERACIONAL.md`, `DONE_DEFINITION_PILOTO.md`, `CHECKLIST_ATIVACAO_FOCUS_1_DIA.md`, `P2_GOVERNANCA_RLS_E_PENTEST.md`), estado do repositório em `main @ 2a63d9d`.
> **Meta do programa:** um cliente real operando o Jinlong em produção, com banco determinístico, segurança auditada e decisão fiscal registrada.

**Correção de escopo incorporada** (verificada em código, registrada como adendo na governança §1.1): o pipeline serial do bip **já está implementado e integrado** (`useCaixaScanPipeline` em `app/caixa/CaixaPageClient.tsx`; `shared-core/src/pdv/scan-pipeline*` com specs) e a paridade de `variantesChaveLeitura` web × desktop **já foi resolvida** (`shared-core/src/caixa/`). A Sprint 4 é, portanto, de **decisão + validação**, não de implementação.

**Convenções deste plano:**
- Tarefas de 1–4 h, com ID `S<sprint>.<n>`.
- Perfis: `Backend` · `Frontend` · `Banco` · `UX` · `QA` · `DevOps` · `Docs`.
- “Ordem” é a posição na cadeia da sprint; tarefas com a mesma ordem podem rodar em paralelo.
- Evidência sempre rastreável: PR, output de comando, screenshot ou checklist preenchido, anexado ao ticket/PR.

---

## Sprint 1 — Fonte única de verdade (banco e release)

**Objetivo:** eliminar o drift produção × repositório e tornar o pipeline de schema determinístico. É a raiz do grafo de dependências: nada que toque banco é seguro antes disto.

**Entregáveis:**
1. Baseline do schema real de produção adotada como ponto zero (`supabase db pull`), com histórico legado preservado em `migrations/_archive/`.
2. Numeração de migrations 100% timestamp daqui em diante.
3. Migration nova (timestamp) para `descontos_venda.operador_id/aplicado_em`.
4. Gate de CI: `supabase db diff` vazio obrigatório em PRs que tocam `backend/supabase/`.
5. Runbook de migração + política escrita “sem hotfix direto em produção”.

**Critérios de aceite:**
- `npx supabase migration list` sem lacunas em staging e produção; coluna Remote alinhada aos arquivos do repo.
- Staging recriado do zero a partir da baseline reproduz produção (verificado por `verify_p0_producao.sql` + smoke SQL sem erro).
- CI falha num PR de teste que introduz drift proposital.
- `descontos_venda` com `operador_id`/`aplicado_em` em produção; desconto aparece na timeline de `/admin/auditoria`.

**Dependências:** acesso admin ao projeto Supabase de produção (`kbabmewnahysfvlybiak`); janela de manutenção acordada; freeze de mudanças de schema durante a sprint.

**Riscos:** `migration repair` no histórico de produção é a operação mais delicada do programa (erro pode marcar como aplicada uma migration que não foi); colisões de numeração exigem conferência manual (não reaplicar `113/235/236` cegamente — `AUDITORIA_DRIFT` §8); PRs abertos que contenham migrations sequenciais novas quebram após o squash.

**Evidências obrigatórias:** output de `migration list` antes/depois (staging e prod); relatório de diff objeto a objeto; output do `verify_p0_producao.sql`; link do run de CI com o gate falhando e passando; PR da baseline.

**Definition of Done:** todos os critérios de aceite verdes **+** um segundo engenheiro (ou revisão registrada) validou o runbook **+** `AUDITORIA_DRIFT_PRODUCAO_REPOSITORIO.md` atualizada com seção “Resolvido em …”.

**Explicitamente fora da sprint:** qualquer feature nova; `system_alerts` e `venda_finance_context` (entram na S5/backlog como novas migrations timestamp); consolidação `/admin` × `/gerente`; refatoração de RPCs legadas v2/v3 (permanecem bloqueadas por stub).

### Tarefas

| ID | Tarefa | Perfil | Est. | Ordem | Paralelo com | Bloqueadores | Impacto |
|---|---|---|---|---|---|---|---|
| S1.1 | Confirmar acesso admin ao Supabase prod, PITR/backup ativo, e declarar freeze de schema (comunicado no repo) | DevOps | 1h | 1 | — | credencial do projeto | Pré-condição de tudo |
| S1.2 | `supabase db pull` de produção em branch dedicada; commit do snapshot bruto | Banco | 2h | 2 | — | S1.1 | Fonte da baseline |
| S1.3 | Diff sistemático baseline × migrations do repo; relatório objeto a objeto (tabelas, funções, policies, grants) | Banco | 4h | 3 | S1.4 | S1.2 | Decide o que é backport vs delta |
| S1.4 | Mini-ADR da estratégia de baseline (squash + `_archive/` + timestamp-only) para aprovação | Docs | 2h | 3 | S1.3 | — | Ratifica a abordagem antes do corte |
| S1.5 | Executar o corte: mover `001`–`255` para `migrations/_archive/`, criar baseline timestamp única | Banco | 3h | 4 | — | S1.3, S1.4 | Elimina a dívida crítica de numeração |
| S1.6 | Conferir que os backports timestamp já existentes (`20260618…`, `20260619…`, `20260620…`) batem com o conteúdo de produção | Banco | 2h | 4 | S1.5 | S1.3 | Evita reintroduzir drift na baseline |
| S1.7 | Reautorar migration timestamp: `descontos_venda ADD operador_id, aplicado_em` | Banco | 1h | 5 | S1.8 | S1.5 | Fecha compliance P1 de auditoria |
| S1.8 | Recriar staging do zero a partir da baseline; rodar `verify_p0_producao.sql` + `smoke_operacao_fluxo_completo.sql` | DevOps | 3h | 5 | S1.7 | S1.5, S1.6 | Prova de reprodutibilidade |
| S1.9 | Janela de manutenção em produção: alinhar `supabase_migrations.schema_migrations` (`migration repair`) + aplicar S1.7 | Banco | 3h | 6 | — | S1.8 aprovado; janela acordada | **Maior risco do programa** — executar em par |
| S1.10 | Gate de CI `supabase db diff` vazio em `ci-backend-supabase.yml` (+ PR de teste provando que falha com drift) | DevOps | 3h | 5 | S1.7, S1.8 | S1.5 | Previne recorrência da dívida crítica |
| S1.11 | Runbook de migração + política “sem hotfix direto em prod” (`docs/`) | Docs | 2h | 4 | S1.5–S1.8 | — | Governança permanente |
| S1.12 | QA pós-reconciliação: E2E crítico (`test:e2e:critical`) + confirmar desconto na timeline de auditoria | QA | 2h | 7 | — | S1.9 | Fecha a sprint com evidência funcional |

**Total estimado: ~28 h.**

---

## Sprint 2 — Segurança e operação fechadas (gate de go-live)

**Objetivo:** deixar o sistema **operável por um cliente real** do ponto de vista de segurança, consistência funcional e evidência operacional. Ao final desta sprint, um go-live **sem fiscal real** já é possível.

**Entregáveis:**
1. Trilha T1–T12 do `P0_CHECKLIST_OPERACIONAL.md` executada e marcada no ambiente-alvo.
2. Veredito funcional do pós-FIADO (venda × títulos `contas_receber`) com correções aplicadas se necessário.
3. P2 de segurança fechado: inventário RLS + 5 cenários de pentest com evidências.
4. E2E dos fluxos mutadores do gerente (cancelar venda, ajuste de estoque).
5. Smoke 360/QQ com evidência; `npm audit` sem `high` aberto.
6. `DONE_DEFINITION_PILOTO.md` §1–§3 preenchido.

**Critérios de aceite:** todos os checklists com `[x]` + evidência anexada; os 5 cenários de abuso do `P2_GOVERNANCA_RLS_E_PENTEST.md` §3 falham como esperado (acesso negado); suíte E2E crítica verde incluindo os novos specs mutadores; nenhum achado crítico de pentest aberto.

**Dependências:** Sprint 1 concluída (banco determinístico); staging estável com seed (`SEED_DEV_E2E`); credenciais E2E (`PLAYWRIGHT_CAIXA_TEST_*`); acesso a máquina com navegadores 360/QQ (ou VM).

**Riscos:** pentest pode revelar policy quebrada com correção maior que o buffer de 4 h (replanejar na hora, não espremer); veredito FIADO pode exigir decisão de produto (restaurar vs remover UI) — decisão deve ser tomada na sprint, não adiada.

**Evidências obrigatórias:** checklists preenchidos com data/responsável; outputs SQL do inventário RLS; gravação/log de cada cenário de abuso; run verde do CI com novos E2E; screenshots 360/QQ anexados em `SMOKE_BROWSER_CHINES_360_QQ.md`.

**Definition of Done:** critérios de aceite verdes **+** gate GO/NO-GO registrado (`DONE_DEFINITION` §3.2) **+** decisão FIADO registrada por escrito **+** nenhum item de segurança P0/P1 aberto no board.

**Explicitamente fora da sprint:** ativação fiscal real (S3); hardening multi-loja de `produtos.SELECT` (backlog, exige decisão de produto); qualquer feature de valor percebido; consolidação `/admin` × `/gerente`.

### Tarefas

| ID | Tarefa | Perfil | Est. | Ordem | Paralelo com | Bloqueadores | Impacto |
|---|---|---|---|---|---|---|---|
| S2.1 | Executar T1–T6 do P0 (link, `migration list`, verify, deploy Edge `sync-outbox`/`validar-gerente`/`fiscal-worker`, secrets) em staging | DevOps | 3h | 1 | S2.3, S2.6, S2.11–S2.14 | Sprint 1 | Destrava toda a trilha operacional |
| S2.2 | Executar T7–T12 (web §5 + teste ponta a ponta §4/§4b) e marcar checklist | QA | 3h | 2 | — | S2.1 | Prova operacional do ambiente |
| S2.3 | Mapear todos os fluxos `contas_receber`/pós-FIADO no app (`gerente/clientes`, `gerente/financeiro`, `lib/gerente/financeiroTitulosServer.ts`) vs backend pós-`245` | Backend | 2h | 1 | S2.1 | — | Insumo do veredito FIADO |
| S2.4 | Teste funcional de títulos: criar, liquidar parcial/total, cancelar; registrar veredito (compatível / quebrado) | QA | 2h | 2 | — | S2.3, S2.1 | Fecha pendência P0 da auditoria de drift |
| S2.5 | (Condicional) Corrigir divergências FIADO: remover UI/ações mortas ou ajustar actions ao backend | Frontend | 4h | 3 | — | S2.4 + decisão de produto | Elimina risco de erro em produção |
| S2.6 | Inventário RLS: rodar os 2 SQLs do P2 §1, exportar e anexar | Banco | 2h | 1 | S2.1 | Sprint 1 | Base do pentest |
| S2.7 | Pentest cenários 1–3: preço adulterado, desconto sem token, replay de nonce no sync | QA | 3h | 2 | S2.8 | S2.1, S2.6 | Valida anti-fraude do núcleo |
| S2.8 | Pentest cenários 4–5: privilege escalation (`authenticated` → `service_role`) e enumeração cross-loja | QA | 2h | 2 | S2.7 | S2.1, S2.6 | Valida isolamento multi-loja |
| S2.9 | Corrigir achados do pentest (buffer; escalar se exceder) | Banco | 4h | 3 | — | S2.7, S2.8 | Fecha achados antes do go-live |
| S2.10 | Hardening `recalcular_saldo_caixa`: checagem de perfil na função (migration timestamp) | Banco | 1h | 1 | tudo | Sprint 1 | Ganho rápido apontado na matriz de autorização |
| S2.11 | E2E Playwright: cancelar venda no gerente (estorno de estoque + auditoria) | QA | 3h | 1 | S2.12 | staging com seed | Cobre o mutador mais crítico sem teste |
| S2.12 | E2E Playwright: ajuste manual de estoque + verificação no kardex | QA | 2h | 1 | S2.11 | staging com seed | Fecha item 4 do BACKLOG_TECNICO |
| S2.13 | Smoke browsers chineses 360/QQ (login, caixa, troca de idioma) + evidências no doc | QA | 2h | 1 | tudo | máquina/VM com browsers | Destrava item 6 do go/no-go |
| S2.14 | Reexecutar `npm audit` (raiz + workspaces); corrigir/atualizar dependência `high` se persistir | DevOps | 2h | 1 | tudo | — | Fecha achado do relatório de risco |
| S2.15 | Consolidar evidências: `DONE_DEFINITION` §1–§3 + `CHECKLIST_P0_STAGING` §7 + gate GO/NO-GO | Docs | 2h | 4 | — | S2.2–S2.14 | Artefato único de auditoria do ciclo |

**Total estimado: ~37 h.**

---

## Sprint 3 — Fiscal real (condicional: cliente exige NFC-e/NF-e)

**Objetivo:** emissão fiscal real (provedor Focus) em produção, com rollback ensaiado. Se o primeiro cliente aceitar operar sem emissão fiscal (decisão registrada `mock`), esta sprint sai do caminho do go-live e vira pós-produção.

**Entregáveis:** checklist `CHECKLIST_ATIVACAO_FOCUS_1_DIA.md` integral (Go/No-Go inicial, D-1, H-0, H+2); decisão `mock` vs `http` registrada (`DONE_DEFINITION` §4); plano de fallback validado por ensaio.

**Critérios de aceite:** NFC-e emitida e **autorizada** em homologação e em produção; fila fiscal sem itens presos e DLQ vazia após a janela H+2; rollback ensaiado com evidência (voltar `FISCAL_PROVIDER_MODE=mock` + redeploy em < 15 min); erros normalizados visíveis na timeline do documento (`066`, `092`).

**Dependências:** Sprints 1–2; **pré-requisitos comerciais externos** — contrato Focus aprovado, token entregue, cadastro fiscal do emitente (CNPJ, regime, série, CSC). **Disparar a trilha comercial no primeiro dia do programa** (tarefa S3.1), pois é o maior lead time e não é comprimível por engenharia.

**Riscos:** dependência de terceiros (Focus, SEFAZ) — janela pode escorregar sem culpa da engenharia; cadastro fiscal incorreto do emitente gera rejeições difíceis de diagnosticar (mitigação: teste A/B/C em homologação antes de H-0).

**Evidências obrigatórias:** XML/protocolo de autorização da NFC-e de teste e da primeira real; screenshot da fila/DLQ pós-janela; log do ensaio de rollback; checklist Focus preenchido com data/responsável.

**Definition of Done:** critérios verdes **+** operador do cliente consegue emitir e reimprimir documento **+** runbook de incidente fiscal referenciado no `RUNBOOK_ROLLBACK.md` **+** monitoramento da fila (cron `fiscal-worker`) confirmado ativo.

**Explicitamente fora da sprint:** NF-e de saída complexa além do escopo NFC-e do piloto; contingência offline de emissão; integração TEF/PIX.

### Tarefas

| ID | Tarefa | Perfil | Est. | Ordem | Paralelo com | Bloqueadores | Impacto |
|---|---|---|---|---|---|---|---|
| S3.1 | Kickoff comercial: cobrar contrato, token e cadastro do emitente; abrir tracking de lead time | Docs | 2h | 1 (dia 1 do programa) | tudo | negócio/cliente | Item de maior lead time do programa |
| S3.2 | Validar token Focus em homologação com chamada direta à API (emissão de teste fora do sistema) | Backend | 2h | 2 | S3.3 | S3.1 | Isola problemas de credencial cedo |
| S3.3 | Preencher cadastro fiscal loja/`pdv_config` no ambiente (campos da `209`/`210`) | Banco | 1h | 2 | S3.2 | S3.1 | Pré-condição da emissão |
| S3.4 | Secrets `fiscal-worker` modo `http` em staging + `npm run env:check` no web com `AUTO_ENQUEUE_FISCAL_ON_SALE=true` | DevOps | 1h | 3 | — | S3.2, S3.3 | Ambiente pronto para testes |
| S3.5 | Testes A/B/C em homologação: emissão ok; erro normalizado + backoff; DLQ + reprocesso manual | QA | 4h | 4 | — | S3.4 | Valida a máquina de estados fiscal ponta a ponta |
| S3.6 | Ensaio de rollback: voltar `mock`, redeploy Edge, rollback Next; cronometrar | DevOps | 2h | 5 | — | S3.5 | Garante saída de emergência na janela real |
| S3.7 | Janela H-0 em produção: aplicar config, emitir primeira NFC-e real, monitorar fila/DLQ até H+2 | DevOps | 4h | 6 | — | S3.5, S3.6, Sprint 2 DoD | Entrega fiscal em produção |
| S3.8 | Registrar evidências e decisão em `DONE_DEFINITION` §4 + atualizar checklist Focus | Docs | 1h | 7 | — | S3.7 | Fecho auditável |

**Total estimado: ~17 h de execução + lead time externo (dias a semanas).**

---

## Sprint 4 — Balcão validado (bip: ratificação + validação operacional)

**Objetivo:** ratificar formalmente (ADR) e validar em condições de loja o pipeline do bip **já implementado**, e formalizar a matriz de degradação offline. Sprint majoritariamente de decisão, documentação e QA.

**Entregáveis:** ADR-PDV-001 com sign-off; `docs/MATRIZ_OFFLINE_PDV.md` preenchida e revisada; teste de burst “sábado simulado” registrado; baseline de telemetria p95 (bip → linha visível); `ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md` atualizado para o estado real; ajustes de UX de fila **somente se** o ADR os aprovar.

**Critérios de aceite:** ADR status “Aceito” com nomes/datas; matriz sem “TODO vago” e revisada por quem faz suporte; burst A+B+C < 300 ms sem duplicação/perda/corrupção (evidência gravada); baseline p95 registrada a partir da telemetria (`caixa_scan_telemetry`).

**Dependências:** disponibilidade de produto + eng lead para o sign-off (agendar na Sprint 1); staging com telemetria ativa. Nenhuma dependência de banco — **paralelizável com S2 e S3**.

**Riscos:** ADR ratificar decisão diferente do que o código já faz → retrabalho (mitigação: levar a implementação atual como proposta default na sessão); teste de burst revelar regressão → vira correção priorizada (buffer S4.6).

**Evidências obrigatórias:** ADR assinado; matriz revisada com nome do revisor; vídeo/log do teste de burst; export da telemetria com p95.

**Definition of Done:** critérios verdes **+** PR template do repo continua coerente com os docs de pipeline **+** decisão F4 (preço no caminho perceptivo) formalmente adiada ou agendada no ADR.

**Explicitamente fora da sprint:** implementação da F4 (preço provisório no bip); virtualização de lista/otimização de store (não-objetivo declarado do contrato); mudanças no núcleo transacional.

### Tarefas

| ID | Tarefa | Perfil | Est. | Ordem | Paralelo com | Bloqueadores | Impacto |
|---|---|---|---|---|---|---|---|
| S4.1 | Preparar e conduzir sessão de sign-off do ADR-PDV-001 (implementação atual como proposta default) | UX | 2h | 1 | S4.5, S4.7 | agenda produto + eng lead | Destrava F1 e fecha risco de inversão doc × código |
| S4.2 | Atualizar `ROADMAP_PDV_INVARIANTES` e ADR para status real (F2/F3 implementadas) | Docs | 1h | 2 | S4.3 | S4.1 | Fonte de verdade volta a ser confiável |
| S4.3 | Preencher `MATRIZ_OFFLINE_PDV.md` linha a linha (scan, preço, desconto, finalizar, sangria, fiscal, TEF) com evidência por célula | Docs | 4h | 2 | S4.2 | S4.1 | Expectativa honesta de degradação para suporte/venda |
| S4.4 | Revisão da matriz por suporte/operação (registro do revisor) | UX | 1h | 3 | — | S4.3 | Critério de saída da F1 |
| S4.5 | Teste de burst “sábado simulado” com checklist derivado do contrato (A+B+C < 300 ms, colar código, Enter + scanner) | QA | 3h | 1 | S4.1, S4.7 | staging | Valida o principal risco operacional de balcão |
| S4.6 | (Condicional) Ajustes de UX de fila aprovados no ADR (ex.: feedback “processando N leituras”) | Frontend | 3h | 4 | — | S4.1, S4.5 | Só se ratificado — evita retrabalho especulativo |
| S4.7 | Extrair baseline p95 da telemetria de scan em staging e registrar no doc de contrato | QA | 2h | 1 | S4.1, S4.5 | telemetria ativa | Orçamento humano do bip passa a ser medido |

**Total estimado: ~16 h.**

---

## Sprint 5 — Valor percebido (pós-go-live)

**Objetivo:** entregar as funcionalidades que o lojista sente no dia a dia (Fase 2 remanescente), sem tocar no núcleo transacional validado. **Não condiciona o go-live** — executa após (ou em paralelo tardio com) a operação assistida do primeiro cliente.

**Entregáveis:** Venda em Espera completa (tabela + RPCs + UI + E2E); `system_alerts` em produção alimentando a timeline de auditoria; quick wins de UX do cadastro de produto; gestão visual de faixas de atacado.

**Critérios de aceite:** venda pausada sobrevive a troca de terminal e retoma com recálculo autoritativo de preço; item indisponível sinalizado no retorno; nenhuma alteração em `finalizar_venda_*`, `cancelar_venda_*`, `decrementar_estoque_seguro` ou fechamento de caixa (regra inviolável da Fase 2); alertas de margem/preço visíveis em `/admin/auditoria`; faixas de atacado editáveis sem SQL, com guard de margem ativo.

**Dependências:** Sprint 1 (migrations novas só sobre baseline reconciliada); idealmente Sprint 4 (ADR ratificado antes de nova UI de caixa).

**Riscos:** baixos — desenho pronto em `PLANO_FASE_2_VALOR_PERCEBIDO.md`; atenção à expiração de token de desconto ao retomar venda em espera (regra já definida no plano).

**Evidências obrigatórias:** PRs com testes; E2E de espera verde no CI; screenshot de alerta na timeline; demo gravada do fluxo de espera para treinamento.

**Definition of Done:** critérios verdes **+** documentação de operação atualizada (`CIRCUITO_OPERACIONAL.md` ou guia do operador) **+** feature flag avaliada para rollout gradual.

**Explicitamente fora da sprint:** multi-loja avançado; TEF/PIX; conciliação bancária; consolidação `/admin` × `/gerente`; F4; kardex avançado (permanecem no backlog S6+).

### Tarefas

| ID | Tarefa | Perfil | Est. | Ordem | Paralelo com | Bloqueadores | Impacto |
|---|---|---|---|---|---|---|---|
| S5.1 | Migration `vendas_em_espera` + RLS (espelhar padrão `venda_eventos`) | Banco | 3h | 1 | S5.7, S5.8, S5.10 | Sprint 1 | Fundação da feature nº 1 de fluidez de balcão |
| S5.2 | RPCs `colocar/retomar/descartar_venda_em_espera` + testes SQL | Banco | 4h | 2 | S5.3 | S5.1 | Contrato servidor da feature |
| S5.3 | Ações no `unifiedCartStore` (`salvarEmEspera`/`carregarDeEspera`) + unit tests | Frontend | 3h | 2 | S5.2 | contrato de payload acordado | Ponte estado local ↔ servidor |
| S5.4 | UI: botão “Colocar em Espera” + aba/lista com rótulo, total, hora (DataTable/Sheet) | Frontend | 4h | 3 | — | S5.2, S5.3 | Superfície visível da feature |
| S5.5 | Retomar com recálculo autoritativo (`calcular_preco_produto`) + sinalização de item indisponível + regra de token expirado | Frontend | 3h | 4 | — | S5.4 | Preserva anti-fraude da Fase 1 |
| S5.6 | E2E: pausar → atender outro cliente → retomar → converter; e descartar com motivo | QA | 4h | 5 | — | S5.5 | Trava regressão do fluxo completo |
| S5.7 | Aplicar `system_alerts` em produção (reautorada como migration timestamp) + conferir timeline | Banco | 2h | 1 | S5.1 | Sprint 1 | Observabilidade de anomalias sem custo de UI nova |
| S5.8 | UX audit do cadastro de produto (encaixar `PLANO_CADASTRO_PRODUTO.md` no estado atual) | UX | 3h | 1 | S5.1 | — | Direciona os quick wins certos |
| S5.9 | Implementar quick wins do cadastro (foco: velocidade e prevenção de erro) | Frontend | 4h | 3 | S5.4 | S5.8 | Redução direta de fricção diária |
| S5.10 | UI de gestão visual de faixas de atacado (sobre `precos_atacado` + RPC `077`) | Frontend | 4h | 1 | S5.1 | — | Autonomia do lojista sem dev |
| S5.11 | Guard de margem nas faixas (reusar `124`/`125`) + validação server-side | Banco | 2h | 2 | — | S5.10 | Protege precificação |

**Total estimado: ~36 h.**

---

## Sprint 6+ — Backlog governado (não planejado em tarefas)

Devolução/troca com RPC única (kardex fechado); consolidação `/admin` × `/gerente` + atualização do `ADMIN_PANEL_GUIDE.md`; arredondamento ABNT unificado fora do motor de preço; kardex avançado (export/materialized view); Fase 3.2 acessibilidade; auto-update Tauri; F4; multi-loja avançado; TEF/PIX (requer decisão de produto). `venda_finance_context` saiu desta fila: aposentadoria formal definida pela tombstone `20260810222702`.

---

## Respostas executivas

### 1. Caminho crítico até um cliente real em produção

Há **dois caminhos críticos possíveis**, dependendo de uma decisão de negócio que deve ser tomada **agora**: o primeiro cliente exige emissão fiscal real?

**Cenário A — go-live sem NFC-e real (decisão `mock` registrada):**

```
S1.1 → S1.2 → S1.3 → S1.5 → S1.8 → S1.9 → S1.12
→ S2.1 → S2.2 → S2.4 → (S2.5) → S2.7/S2.8 → S2.9 → S2.15 → GO-LIVE
```
≈ **42–46 h de execução no caminho** (+ tarefas paralelas fora dele). Com uma equipe pequena, ~3 semanas de calendário incluindo janelas e aprovações.

**Cenário B — cliente exige NFC-e:** acrescenta `S3.2 → S3.5 → S3.6 → S3.7` ao final (≈ +13 h de execução), **mas o item dominante é o lead time externo de S3.1** (contrato Focus + token + cadastro do emitente). Por isso S3.1 dispara no **dia 1 do programa**, em paralelo à Sprint 1 — se a trilha comercial correr durante S1–S2, a ativação fiscal não adiciona semanas ao calendário, apenas a janela H-0.

Em ambos os cenários, o gargalo técnico singular é **S1.9 (repair do histórico de produção)** — janela única, alto risco, sem paralelização possível.

### 2. O que pode ocorrer em paralelo

- **Durante a Sprint 1** (nada disto toca schema): S3.1 (trilha comercial fiscal — obrigatório começar já), S4.1/S4.5/S4.7 (ADR + burst + telemetria), S2.11–S2.14 (E2E mutadores, smoke 360/QQ, npm audit — rodam contra staging atual), S1.4/S1.11 (docs).
- **Durante a Sprint 2:** toda a Sprint 4; S3.2–S3.5 em homologação (assim que S3.1 destravar); S2.10–S2.14 entre si.
- **Durante a Sprint 3:** S4 remanescente; preparação de S5 (S5.8 UX audit).
- **Regra geral:** QA, UX, Docs e a trilha comercial nunca ficam bloqueados pelo banco; o perfil Banco/DevOps é o recurso contendido — proteger sua agenda para S1.9 e S3.7.

### 3. Maior relação impacto/esforço

| Entrega | Esforço | Impacto |
|---|---|---|
| S1.7 — migration `descontos_venda` auditoria | 1h | Fecha compliance P1 (quem deu desconto, quando) — pendência de auditoria desde junho |
| S2.10 — hardening `recalcular_saldo_caixa` | 1h | Fecha recomendação explícita da matriz de autorização |
| S1.10 — gate CI `db diff` | 3h | **Previne a recorrência da dívida crítica inteira**; melhor seguro do programa |
| S2.13 — smoke 360/QQ | 2h | Destrava um item de go/no-go inteiro com duas horas de QA |
| S4.1 — sign-off do ADR | 2h | Uma reunião destrava F1, F4 e elimina o risco de retrabalho por decisão implícita |
| S2.11/S2.12 — E2E mutadores | 5h | Cobre os dois fluxos mutadores sem rede de proteção; reduz risco de todas as sprints seguintes |
| S3.1 — kickoff comercial fiscal | 2h | Duas horas de coordenação que podem economizar semanas de calendário |

### 4. O cronograma continua válido com apenas um desenvolvedor?

**A ordem continua válida; as datas não.** O plano foi desenhado com dependências explícitas justamente para degradar bem:

- **O que muda:** paralelização interna desaparece — as sprints viram fases sequenciais. Somando os caminhos: S1 (28h) + S2 (37h) + S3 (17h) + S4 (16h) ≈ **98 h ≈ 3 semanas úteis focadas** até um go-live com fiscal (cenário B), ou ~2,5 semanas no cenário A. S5 (36h) fica integralmente pós-produção.
- **O que não muda:** os dois “paralelismos” que sobrevivem são exatamente as **esperas externas** — lead time comercial do fiscal (S3.1) e agenda de sign-off do ADR (S4.1). Um dev solo deve disparar ambos no dia 1 e preencher as esperas com S2.11–S2.14 e S4.3/S4.5.
- **Riscos específicos do modo solo:** (a) **S1.9 sem par** — mitigar com runbook passo a passo revisado antes (S1.11), PITR confirmado e execução gravada; (b) **QA feito pelo próprio autor** — mitigar priorizando os E2E automatizados (S2.11/S2.12/S5.6) sobre teste manual, e exigindo evidência anexada mesmo assim; (c) **perfis Banco/DevOps/Frontend na mesma pessoa** — o plano já limita tarefas a 1–4 h, o que reduz o custo de troca de contexto, mas recomenda-se não intercalar S1.x com tarefas de outra sprint no mesmo dia.
- **Recomendação de corte para 1 dev:** manter S1 + S2 intactas (são o gate de produção), executar S4 apenas até S4.5 (sign-off + burst), condicionar S3 à exigência real do cliente, e mover S5 inteira para depois da primeira semana de operação assistida.
