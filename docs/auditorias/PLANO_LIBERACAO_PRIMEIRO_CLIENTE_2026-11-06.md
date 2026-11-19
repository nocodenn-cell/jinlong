# Plano de liberação do primeiro cliente pagante — Jinlong (2026-11-06)

**Origem:** [AUDITORIA_PRONTIDAO_COMERCIAL_2026-11-06.md](AUDITORIA_PRONTIDAO_COMERCIAL_2026-11-06.md) (veredito NÃO PODE ENTRAR, 35%).
**Meta:** PODE ENTRAR COM RESTRIÇÕES — instalar, operar e cobrar o primeiro cliente, com escopo delimitado (loja única, um caixa, venda presencial na versão web, dinheiro/PIX/débito/crédito registrados, sem fiado, sem emissão fiscal pelo sistema).
**Estado desta etapa:** planejamento e investigação de código. Nada foi alterado em produção, homologação, banco, branch remota, commit ou push.

**Ambiente local desta sessão:** Docker **indisponível** e `node_modules` ausente. Por isso nenhum teste SQL ou E2E foi executado aqui. Os testes abaixo são o que precisa ser rodado, não o que já passou.

---

## 1. Reavaliação dos bloqueadores P0

Legenda da evidência: **[código]** confirmado por leitura no repositório nesta sessão; **[doc]** vem de documento do repositório, não reexecutado.

### P0-1 — Views expõem vendas de todas as empresas (produção)

- **Evidência atual:** [doc] `RECONCILIACAO_HOMOLOG_2026-11-04` e `APLICAR_20261104120000_ANON_PRIVILEGIOS.md`: em produção, `anon` tinha 220 grants em `public`; `v_vendas_dia`, `v_top_produtos` e `v_venda_consistencia_anomalias` sem `security_invoker`. Achado de 2026-11-05: `20261104120000` **ausente** do histórico de produção. [código] A migration existe e contém `ALTER VIEW ... SET (security_invoker = true)` (linhas 26–28) e remove os grants de `anon`.
- **Causa raiz:** views criadas como `SECURITY DEFINER` implícito (sem `security_invoker`), portanto ignoram o RLS do chamador; e `anon`/`authenticated` com grants amplos em `public`.
- **Correção mínima:** aplicar `20261104120000` como está (já tem rollback em `backend/supabase/rollback/20261104120000_sec_anon_privilegios_minimos.rollback.sql`). Não reescrever a migration.
- **Dependências:** (a) backup lógico antes (P0-3); (b) verificar o formulário de leads: `20261104150000` cria `registrar_lead_comercial`, que não existe em produção; aplicar 120000 sem ela deixa o formulário comercial quebrado (já quebrado hoje). Decidir o lote (ver §4, decisão D-A1); (c) autorização explícita.
- **Testes necessários:**
  1. Script de RLS cruzado (novo, `backend/scripts/rls-views-cross-tenant.test.sql`): dois tenants A e B com vendas; usuário de A consulta as três views e não vê linhas de B; `anon` recebe `permission denied`. Roda em banco local.
  2. Rodar `backend/scripts/test-rls-policies.mjs` e `p0-rls-rest-smoke.mjs` contra homologação com JWTs de teste (autorizado).
  3. Pós-aplicação em produção: leitura somente, com `anon` e com usuário de teste de outra empresa.
- **Critério de aprovação:** (i) `anon` sem `SELECT` nas views e tabelas de `public`; (ii) teste cruzado retorna 0 linhas de outro tenant nas 3 views; (iii) checagem pós-aplicação em produção sem erro.
- **Risco de não corrigir:** exposição de faturamento e vendas de outras empresas a qualquer visitante (`anon`). Já ocorre em produção. Impacto legal (LGPD) e de confiança.

### P0-2 — Migrations de produção fora do repositório (drift)

- **Evidência atual:** [doc] 11 migrations de produção sem registro (`migration-remote-drift` vermelho); 12 migrations da `main` adiadas em `.github/deploy-governance/deferred-migrations.json` (`20261028100000`–`20261104180000`). [código] Os guards `guard:migrations` passam (sem colisão de numeração), mas não comparam com produção.
- **Causa raiz:** aplicação manual fora do fluxo de migration; lista de adiamento sem matriz de dependência; ausência de checagem contra o `schema_migrations` real.
- **Correção mínima:** (1) matriz `versão × arquivo × existe em prod × existe em homolog × dependências` (documento, sem alterar nada); (2) para cada versão, decidir: já aplicada de fato (registrar só após comparar o efeito no schema) ou aplicar em ordem; (3) corrigir a lista de adiamento.
- **Dependências:** leitura de `schema_migrations` e do catálogo de produção (exige autorização do dono — ver §5); Docker para ensaiar a sequência em banco descartável.
- **Testes necessários:** replay da sequência completa `20261028100000`→`20261104180000` num banco limpo com Supabase local; cada rollback testado em transação (`ROLLBACK`); `migration-remote-drift` verde após reconciliação.
- **Critério de aprovação:** `migration-remote-drift` verde; matriz sem versão "indefinida"; replay limpo sem erro; decisão registrada por versão.
- **Risco de não corrigir:** o próximo deploy pode falhar ou aplicar algo não testado; ninguém sabe qual schema está em produção.

### P0-3 — Backup e restauração não comprovados

- **Evidência atual:** [doc] `docs/ops/BACKUP_RESTAURACAO_SEM_PITR.md`: procedimento testado só em contêiner descartável; PITR e retenção do projeto `jinlong` não verificados; restore drill em produção não feito. [código] `backend/scripts/backup-ro-postgres.sh` existe e exige Docker.
- **Causa raiz:** o backup depende de painel do provedor (não verificável pelo repositório) e de execução manual.
- **Correção mínima:** (1) dono registra PITR, retenção e último backup no painel; (2) dump lógico de leitura com hash; (3) restore drill em contêiner com contagens das tabelas-chave e número de funções.
- **Dependências:** P0-2 (o drill deve rodar sobre o schema reconciliado); Docker local; credencial de leitura guardada no gerenciador de senhas.
- **Testes necessários:** `backup-ro-postgres.sh` em Docker; `pg_restore --list`; contagens iguais à origem; medição de RTO.
- **Critério de aprovação:** registro do painel anexado; dump com `.sha256`; restauração sem erro com contagens iguais; RTO medido e aceito pelo dono.
- **Risco de não corrigir:** perda de dados sem caminho de recuperação comprovado; a própria doc diz que sem isso a aplicação em produção não é autorizada.

### P0-4 — E2E de interface e concorrência não executados

- **Evidência atual:** [doc] `GO_LIVE_01_E2E_STACK.md`: E2E bloqueado por falta de acesso aos `.env` e porque a API local serve outro banco. [código] `pdv-importados/playwright.config.ts` e `playwright.pdv100.config.ts`; scripts `pdv-meios-pagamento-concorrencia.sh` e `devolucao-concorrencia.sh` existem.
- **Causa raiz:** ambiente de teste sem stack isolada; `baseURL` não fixado; contas de teste sem seed.
- **Correção mínima:** stack Supabase local (Docker) com seed de empresa A e B, usuários operador/gerente/dono; `baseURL` fixo em `localhost`; rodar `e2e/caixa-*.spec.ts` e os dois scripts de concorrência.
- **Dependências:** Docker; P0-6 a P0-10 precisam estar corrigidos antes do E2E final (senão falha de propósito).
- **Testes necessários:** golden flow de interface (login, caixa, venda, dividido, espera, cancelamento, devolução, fechamento, estoque, financeiro); concorrência de duas sessões e clique repetido; "Não foi possível concluir" após operação efetivada (item já listado).
- **Critério de aprovação:** suíte Playwright verde no stack local; concorrência sem venda duplicada nem baixa dupla; zero "Não foi possível concluir" após sucesso.
- **Risco de não corrigir:** venda duplicada ou caixa divergente não detectados antes do cliente.

### P0-5 — PIX e cartão geram recebível sem conta financeira

- **Evidência atual:** [doc] `PDV_100_1_DEFEITOS_E_DECISOES.md` (D-07): recebível PENDENTE sem conta, porque a loja não tem `contas_financeiras` nem `financeiro_contas_forma`. [doc] Golden flow bloco 7 passou, mas "contas a receber: NÃO TESTADO".
- **Causa raiz:** o cadastro de contas é pré-requisito de instalação, mas não é validado pela venda.
- **Correção mínima:** (1) incluir configuração de contas no checklist de instalação (sem código); (2) decisão D-07: se a venda de PIX/cartão deve bloquear sem conta, criar validação na RPC de finalização (nova versão, não editar a anterior).
- **Dependências:** decisão D-07; P0-7 (mesmo ponto de RPC).
- **Testes necessários:** venda PIX sem conta → recusada com código claro; com conta → gera 1 recebível ABERTO com valor correto; conferência de `movimentos_financeiros`.
- **Critério de aprovação:** nenhuma venda PIX/cartão grava recebível PENDENTE sem conta; conta configurada gera recebível conciliável.
- **Risco de não corrigir:** o financeiro não fecha com o caixa; a conferência do fim do mês fica manual.

### P0-6 — Venda em espera sobrevive ao fechamento do caixa

- **Evidência atual:** [código] `fechar_caixa_pdv_atomico` (última versão em `backend/supabase/migrations/20260621002300_227_fechar_caixa_pdv_atomico.sql`) não consulta `vendas_em_espera`. [doc] D-06 reproduzido com "Pedido #2 EM_ESPERA" após fechamento.
- **Causa raiz:** regra de fechamento não inclui vendas pendentes do caixa.
- **Correção mínima:** nova migration que substitui `fechar_caixa_pdv_atomico` e recusa o fechamento se houver venda `EM_ESPERA` do caixa (mensagem com quantidade). Alternativa (transferir ou descartar) fica para depois. Só recomendo a versão bloqueante porque é a única que não gera divergência.
- **Dependências:** decisão D-06; autorização de migration; P0-4 para teste.
- **Testes necessários:** espera aberta → fechamento recusado; após converter ou descartar → fechamento ok; saldo fechado idêntico ao esperado.
- **Critério de aprovação:** fechamento impossível com espera aberta; zero venda em espera órfã em caixa FECHADO (consulta de verificação).
- **Risco de não corrigir:** venda registrada no cliente que nunca entra no caixa.

### P0-7 — Troco e valor recebido não persistidos

- **Evidência atual:** [código] não há coluna `valor_recebido` nem `troco` em migrations (busca em `backend/supabase/migrations`). [doc] D-05: `vendas_pagamentos` grava só o líquido; troco de 15,10 aparece só na tela.
- **Causa raiz:** modelo de pagamento não guarda o que o cliente entregou.
- **Correção mínima:** colunas `valor_recebido numeric(10,2)` e `troco numeric(10,2)` nullable em `vendas_pagamentos`, com check `troco >= 0` e `valor_recebido >= valor` quando dinheiro. Gravar via RPC de finalização (nova versão, com parâmetro opcional com default `null`, sem quebrar as 22 args do scope-guard — conferir antes).
- **Dependências:** decisão D-05 (o dono já deve aprovar; o histórico diz que depende de aprovação); SSoT do fechamento (o troco não entra no saldo, só o líquido); PDV local (`registrar_venda_com_itens`) fica fora deste corte.
- **Testes necessários:** venda 134,90 em dinheiro recebendo 150,00 → `valor_recebido=150`, `troco=15,10`, caixa +134,90; sem troco → colunas null ou iguais.
- **Critério de aprovação:** para toda venda em dinheiro, `valor_recebido − troco = valor` e caixa recebe o líquido.
- **Risco de não corrigir:** impossível auditar o dinheiro recebido; divergência de caixa em disputa com o cliente.

### P0-8 — Fração aceita em produto unitário

- **Evidência atual:** [doc] D-04: carrinho aceita 2,5 de produto UN; `shared/format/quantidadeCaixa.ts` aceita 3 casas por design (balança). [código] confirmado que `pdv-importados/app/caixa` não consulta `unidade_medida` no carrinho (relatório, seção D-04).
- **Causa raiz:** regra de quantidade só na tela, sem consulta ao tipo de unidade. Regra de negócio ausente no core.
- **Correção mínima:** regra no backend: produto com `unidade_medida = 'UN'` aceita só inteiro; demais aceitam fração. Validar na RPC (não só na tela — SSoT). Se o dono quiser balança para UN, usar um atributo explícito, não exceção.
- **Dependências:** decisão D-04 (a loja vende a granel?); RPC de finalização (mesma migration de P0-7 pode agrupar, mas é PR separado).
- **Testes necessários:** UN com 2,5 → recusado no backend e na tela; KG com 0,5 → aceito; estoque conferido.
- **Critério de aprovação:** nenhuma linha de venda com fração em UN; estoque final igual ao esperado nos testes.
- **Risco de não corrigir:** divergência de estoque em produtos contados em unidade.

### P0-9 — Cancelamento de venda de caixa fechado e cancelamento sem `caixa_id`

- **Evidência atual:** [código] `cancelar_venda_transacional` (última versão em `20261007171000_ssot_002_cancel_guard_antes_devolucao.sql`) pega o caixa **da própria venda** (`v_venda.caixa_id`, linha 36) e chama `sincronizar_saldo_cache(v_caixa.id)` (linha 125). Se esse caixa já está FECHADO, o estorno altera o saldo de um caixa fechado, e o dinheiro físico está no caixa aberto. [doc] S9b e S12 em `PROXIMOS_PASSOS.md`.
- **Causa raiz:** o estorno é contabilizado no caixa de origem, não no caixa em que o dinheiro sai. Não há regra para o cancelamento de caixa fechado.
- **Correção mínima:** regra de negócio (decisão D-09 abaixo): cancelamento de venda de caixa fechado registra a saída no caixa aberto atual do mesmo operador ou gerente, e não altera caixa FECHADO; cancelamento exige `caixa_id` explícito quando houver mais de um caixa aberto na loja.
- **Dependências:** decisão D-09; migration nova de `cancelar_venda_transacional`; caixa aberto obrigatório para estorno em dinheiro.
- **Testes necessários:** venda em caixa A (fechado), caixa B aberto, cancelar → saldo de A inalterado, B −valor, auditoria registrada; dois caixas abertos sem `caixa_id` → recusado.
- **Critério de aprovação:** soma dos saldos de caixas FECHADO e ABERTO bate com dinheiro recebido − estornado, em todos os cenários do teste.
- **Risco de não corrigir:** saldo de caixa fechado alterado depois da conferência; divergência entre turnos.

### P0-10 — Preço de atacado ignorado; fonte duplicada

- **Evidência atual:** [doc] D-11: `produtos.preco_atacado` (17,90) ignorado; só `precos_atacado` (faixas) vale. [código] `preco_atacado` ainda é escrito em migrations de importação e de estoque (`20261005224553`, `20261005225856`, `20261007163100`) e validado contra o custo unitário.
- **Causa raiz:** duas fontes de preço de atacado, uma legada e uma nova, sem decisão de qual é oficial.
- **Correção mínima:** decisão D-11. Recomendo as faixas (`precos_atacado`) como fonte única; `produtos.preco_atacado` passa a ser só leitura de importação/exibição até migrar. Não apagar a coluna nesta fase.
- **Dependências:** D-11; mudança na tela de produto e no import (CSV traz `preco_atacado`?).
- **Testes necessários:** venda com quantidade que cai em faixa → preço da faixa; sem faixa → preço de varejo; tela e recibo mostram o mesmo preço.
- **Critério de aprovação:** o preço da venda coincide com a regra escolhida em 100% dos casos testados; nenhuma tela mostra um atacado que a venda não usa.
- **Risco de não corrigir:** cliente recebe preço diferente do anunciado; reclamação e perda de margem.

---

## 2. Fases de execução

Tamanho: P = pequeno (até 1 PR simples), M = médio (1–2 PRs com migration ou teste extenso), G = grande (várias migrations ou depende de produção). Sem prazo calendário; depende de decisões e janelas.

### Fase A — Segurança e isolamento multiempresa

| PR | Conteúdo | Tipo | Tam. | Autorização |
|---|---|---|---|---|
| A1 | Teste cruzado `rls-views-cross-tenant.test.sql` + smoke de leads | teste | P | não |
| A2 | Checagem: `anon` sem acesso a leads e views; decidir lote de leads (`20261104150000`–`170000`) | verificação + decisão | P | não (decisão) |
| A3 | `tenant_guard` nas tabelas de multiempresa fase 2 (`comissoes_*`, `funcionario_dados`, `import_*`) — só se o teste A1 mostrar vazamento; senão, P1 | migration | M | sim (aplicação) |
| A4 | Confirmar que nenhum caminho cria ADMIN (`grep` nas RPCs e no app) e documentar | verificação | P | não |
| A5 | Aplicação de `20261104120000` (+ lote de leads) em produção | operação | P | **sim** |

### Fase B — Reconciliação de migrations e integridade do banco

| PR | Conteúdo | Tipo | Tam. | Autorização |
|---|---|---|---|---|
| B1 | Matriz `versão × repo × prod × homolog` (documento) | doc | P | leitura de prod: **sim** |
| B2 | Ensaio do replay `20261028100000`→`20261104180000` em banco descartável | teste | M | não (Docker) |
| B3 | Rollbacks testados em transação para cada versão | teste | M | não (Docker) |
| B4 | Aplicação ordenada em produção; registro em `schema_migrations` | operação | G | **sim** |
| B5 | Atualizar `deferred-migrations.json` e `migration-remote-drift` verde | governança | P | sim (label) |

### Fase C — Backup, PITR e restauração

| PR | Conteúdo | Tipo | Tam. | Autorização |
|---|---|---|---|---|
| C1 | Dono registra PITR/retenção/último backup no painel (anexo) | operação | P | dono |
| C2 | Dump lógico de produção com hash | operação | P | **sim** (credencial) |
| C3 | Restore drill em contêiner com contagens e RTO | teste | M | não (Docker) |
| C4 | Runbook de restauração com RPO/RTO medidos | doc | P | não |

C3 pode rodar **agora** se o Docker for iniciado, usando um dump de homologação ou um banco de teste.

### Fase D — Correções de caixa, estoque e pagamentos

| PR | Conteúdo | Tipo | Tam. | Depende de |
|---|---|---|---|---|
| D1 | Fechamento bloqueia com venda em espera (P0-6) | migration + teste | M | D-06 |
| D2 | Cancelamento de caixa fechado e `caixa_id` obrigatório (P0-9) | migration + teste | G | D-09 |
| D3 | Fração em UN recusada no backend (P0-8) | migration + teste | M | D-04 |
| D4 | Troco e valor recebido (P0-7) | migration + teste | M | D-05 |
| D5 | Validação de conta para PIX/cartão (P0-5) | migration + teste | M | D-07; idealmente após D4 (mesma RPC) |
| D6 | Fonte única de atacado (P0-10) | código + teste | M | D-11 |

D1 e D3 não dependem de D4/D5 e podem ser feitos em paralelo. D2 é o maior risco: mexe em saldo de caixa, então precisa do teste de conciliação antes de qualquer merge.

### Fase E — Homologação E2E do fluxo comercial

| PR | Conteúdo | Tipo | Tam. | Autorização |
|---|---|---|---|---|
| E1 | Stack local Supabase com seed de duas empresas e papéis | infra de teste | M | Docker |
| E2 | Playwright `caixa-*` com `baseURL` fixo | teste | M | não |
| E3 | Concorrência (duas sessões, clique repetido, devolução) | teste | M | E1 |
| E4 | Importação CSV de produtos com planilha de teste real | teste | M | E1 |
| E5 | Golden flow de interface completo (login → fechamento → financeiro) | teste | M | D1–D6, E2–E4 |
| E6 | Leitor de código de barras e impressora térmica na loja | presencial | P | **sim** (presença) |
| E7 | Homologação remota com contas de teste | operação | M | **sim** |

### Fase F — Preparação da instalação e operação

| PR | Conteúdo | Tipo | Tam. | Depende de |
|---|---|---|---|---|
| F1 | Checklist de instalação revisado para o escopo (web, loja única, sem fiscal, sem fiado) | doc | P | D1–D6 |
| F2 | Passo de configuração de contas financeiras e formas de pagamento | doc | P | D5 |
| F3 | Cadastro de usuários, PIN de gerente, troca de operador | doc + teste | P | E2 |
| F4 | Manual do operador (`MANUAL_OPERADOR_RESUMIDO.md`) atualizado com o escopo | doc | P | E5 |
| F5 | Termos e Privacidade: remover a promessa de emissão fiscal | doc (jurídico) | P | decisão D-12 |
| F6 | Playbook de rollback e suporte, com contatos | doc | P | — |

---

## 3. Sequência exata de execução

1. **Agora (sem autorização):** A1, A4, B2 e B3 (se Docker iniciado), C3 (idem), E1 e E2 (infra local), D1 e D3 como código em branch local (decisões D-06 e D-04 devem ser confirmadas antes do merge).
2. **Com decisões do dono:** D2 (D-09), D4 (D-05), D5 (D-07), D6 (D-11). Não mergear sem a decisão.
3. **Depois de D1–D6 e A1:** E3, E4, E5.
4. **Com autorização de produção:** B1 (leitura), C1 e C2, depois A5 (aplicação de segurança), depois B4 (demais migrations). Nessa ordem, porque A5 é a exposição mais grave e não depende das demais.
5. **Fechamento:** F1–F6, E6 (presencial) e E7.

**Dependências críticas:**
- A5 depende de C2 (backup) pelo runbook.
- B4 depende de B2/B3 (replay e rollback).
- E5 depende de todos os P0 corrigidos.
- D5 e D4 tocam a mesma RPC de finalização: fazer D4 primeiro, D5 em seguida.
- D2 depende de D-09 (regra para caixa fechado), que ainda não foi decidida.

---

## 4. Decisões que dependem do dono

| ID | Decisão | Recomendação |
|---|---|---|
| D-A1 | Lote de leads (`20261104150000`–`170000`) entra junto com A5? | Sim, junto. Sem a RPC, o formulário comercial continua quebrado |
| D-04 | Vende a granel em produto UN? | Não. UN só inteiro; granel via unidade própria |
| D-05 | Autoriza `valor_recebido`/`troco` (nova coluna e RPC)? | Sim |
| D-06 | Fechamento com espera aberta: bloquear, transferir ou descartar? | Bloquear |
| D-07 | Venda PIX/cartão sem conta: bloquear ou gerar recebível pendente? | Bloquear |
| D-09 | Cancelamento de venda de caixa fechado: onde registra a saída? | No caixa aberto atual; caixa fechado não muda |
| D-11 | Fonte oficial do atacado? | Faixas (`precos_atacado`); coluna legada só leitura |
| D-12 | Termos: retirar a promessa de emissão fiscal antes de cobrar? | Sim |
| D-13 | Escopo do piloto: web apenas, sem leitor/impressora físicos até E6? | Sim |
| D-14 | Autoriza o dump de produção (C2) e a leitura do catálogo (B1)? | Sim, com credencial só de leitura |
| D-15 | Confirma PITR e retenção no painel (C1)? | Dono verifica e registra |

---

## 5. Pode ser executado imediatamente × continua bloqueado

**Pode agora (autonomia técnica, sem tocar ambientes compartilhados):**
- Investigação e documentação (este plano, matriz de migrations sem consultar produção, runbooks).
- Teste cruzado de RLS (A1), teste de cancelamento (D2), teste de fechamento (D1), teste de fração (D3).
- Implementação em branches locais, sem commit, de D1 e D3 (ficam prontas para revisão).
- Infra local de teste (E1, E2) — assim que Docker estiver disponível.
- Scripts de validação e checklists (F1–F4, F6).

**Continua bloqueado por autorização explícita:**
- Qualquer alteração em produção (A5, B4, C2, B1 se houver leitura direta).
- Alterações remotas em homologação, aplicação de migrations remotas.
- Deploy, merge em branch protegida, commit e push (inclusive dos arquivos desta auditoria).
- Exclusão ou alteração de dados reais; alteração de credenciais e configurações do cliente (contas financeiras, usuários).
- Decisões de produto D-04 a D-15.

---

## 6. Critérios de encerramento (situação atual)

| Critério | Status | Evidência atual |
|---|---|---|
| Isolamento entre empresas | FALHOU | Views vazam em produção; homologação passou (`RECONCILIACAO_HOMOLOG`) |
| Ausência de divergência de estoque | FALHOU | D-04 (fração UN) em aberto |
| Ausência de divergência de caixa | FALHOU | D-06, S9b, S12 |
| Pagamentos corretamente registrados | FALHOU | D-05 (troco), D-07 (recebível sem conta) |
| Cancelamentos e devoluções consistentes | NÃO TESTADO | Banco passou (golden flow blocos 11–12); UI não testada; cancelamento de caixa fechado é FALHA (D2) |
| Fechamento de caixa confiável | FALHOU | D-06 (espera) |
| Migrations reconciliadas | FALHOU | 11 sem registro; 12 adiadas |
| Backup restaurável | NÃO TESTADO | Só em contêiner descartável |
| Importação real de produtos validada | NÃO TESTADO | Testes unitários existem, não executados nesta sessão; sem planilha real |
| Testes E2E aprovados | NÃO TESTADO | Playwright nunca executado contra stack isolada |
| Instalação documentada | NÃO TESTADO | Checklists existem; falta revisão para o escopo (F1–F2) |
| Operação sem intervenção técnica frequente | NÃO TESTADO | Depende de E5 e de F3–F4 |

Nenhum critério está PASSOU neste momento. Os comprovados no banco (venda, cancelamento, devolução, ajuste, fechamento com diferença) não bastam: não há teste de interface e há falhas abertas nos mesmos fluxos.

---

## 7. Critério final para liberar o primeiro cliente

Todos os itens abaixo com evidência anexada (não "parece pronto"):

1. A5 aplicado e verificado em produção (anon e cross-tenant sem acesso).
2. B1–B5: `migration-remote-drift` verde e replay limpo.
3. C1–C4: backup com hash e restore com RTO medido.
4. D1–D6 mergeados com decisões D-04 a D-11 registradas.
5. E1–E5 verdes; E6 feito na loja.
6. F1–F6 revisados; contas financeiras configuradas no ambiente do cliente.
7. Termos revisados (D-12).

Até lá: **NÃO PODE ENTRAR**. Com 1–5 completos e 6–7 pendentes, o veredito passa a **PODE ENTRAR COM RESTRIÇÕES**.

---

## 8. Riscos se o plano não for seguido

- Vazamento entre empresas continua em produção (A5).
- Divergência de caixa e estoque ocorre em uso real (D1–D6).
- Sem restauração medida, uma perda de dados vira um incidente sem saída.
- Suporte técnico frequente por causa do drift de migrations e de tokens revogados.

---

## 9. Status de execução

**Decisões aprovadas pelo dono em 2026-11-06:** recomendações de D-04, D-05, D-06, D-07, D-09 e D-11.

| Item | Situação |
|---|---|
| D1 (D-06, P0-6) | Escrito em branch local `claude/plano-liberacao-d1-d3`: `backend/supabase/migrations/20261106100000_d1_fechamento_bloqueia_vendas_em_espera.sql` (trigger em `caixas`, cobre web e sync) + rollback. Sem commit. |
| D3 (D-04, P0-8) | Escrito na mesma branch: `backend/supabase/migrations/20261106110000_d3_quantidade_inteira_produto_un.sql` (trigger em `itens_venda`) + rollback. Sem commit. |
| Teste D1/D3 | `backend/scripts/d1-d3-fechamento-espera-quantidade-un.test.sql`. **Não executado** (sem Docker). |
| Guards | `guard:migrations`, `guard:rpc`, `guard:no-prod-target` passam. |
| D5 (D-07), D4 (D-05), D2 (D-09), D6 (D-11) | **Pendentes.** Aprovadas, mas ainda não escritas. D4 e D5 tocam a mesma RPC, então entram juntas. |

**Pré-checagem obrigatória antes de aplicar D3 em produção:** o default de `produtos.unidade_medida` é `'UN'`. Produto de balança cadastrado sem unidade própria ficará bloqueado para fração. A query de verificação está no cabeçalho da migration 20261106110000.

**Ressalva de D1:** o web mostra o erro bruto da RPC (`FECHAR_CAIXA_VENDAS_EM_ESPERA`). Mensagem amigável na tela fica para a fase E.

### Atualização 2026-11-07 — D4 e D5

| Item | Situação |
|---|---|
| D4 (D-05, P0-7) | `backend/supabase/migrations/20261107100000_d4_valor_recebido_troco.sql`: colunas `valor_recebido` e `troco` em `vendas_pagamentos`, check de consistência, mesmo mecanismo de parcelas (GUC + trigger), wrapper web com `fp_preparar_valor_recebido`. Rollback restaura o corpo original do wrapper. |
| D4 UI | `CaixaPageClient.tsx` envia o dinheiro entregue (`valorRecebido`, antes do desconto do troco); `finalizarVendaValidation.ts` valida; `caixaVendas.impl.ts` envia `valor_recebido` só em DINHEIRO. |
| D5 (D-07, P0-5) | `backend/supabase/migrations/20261107110000_d5_pagamento_exige_conta_financeira.sql`: trigger BEFORE INSERT em `vendas_pagamentos` recusa PIX/CARTAO_* sem conta ativa na loja. |
| Teste | `backend/scripts/d4-d5-troco-conta-pagamento.test.sql` (pela RPC real). **Não executado** (sem Docker). |
| Guards | `guard:migrations`, `guard:rpc`, `guard:core`, `guard:pdv`, `guard:pricing`, `guard:no-prod-target` passam. |
| TypeScript | **Não verificado**: `node_modules` ausente, `tsc` não rodou. |

**Ressalvas registradas:**
- Troco não persiste se a linha de dinheiro líquida ficar em zero (o cliente pagou tudo com outras formas e entregou só dinheiro excedente). Caso raro; a UI remove a linha com valor zero.
- D5 cobre `vendas_pagamentos`. Venda sem nenhuma linha de pagamento e com forma PIX não passa pela trava. Confirmar no E5 se a UI sempre grava linha de pagamento.
- D5 bloqueia lojas sem conta configurada: a instalação (F2) precisa configurar contas e formas antes da primeira venda PIX ou cartão.
- Pré-checagem de produção: listar lojas com PIX ou cartão vendido e sem `financeiro_contas_forma` ativa antes de aplicar D5.

### Atualização 2026-11-07 — D2 e D6

| Item | Situação |
|---|---|
| D2 (D-09, P0-9; S9b e S12) | `backend/supabase/migrations/20261107120000_d2_estorno_dinheiro_caixa_aberto.sql`: trigger BEFORE INSERT em `devolucoes` atribui o estorno em DINHEIRO ao caixa ABERTO da loja quando a venda é de caixa FECHADO. Recusa sem caixa aberto (`CANCELAR_VENDA_CAIXA_FECHADO_SEM_CAIXA_ABERTO`), com dois ou mais (`CANCELAR_VENDA_CAIXA_ABERTO_AMBIGUO`) e com saldo insuficiente. Trigger AFTER sincroniza o cache do caixa aberto. Venda de caixa aberto: sem mudança. Rollback incluído. Teste: `backend/scripts/d2-estorno-dinheiro-caixa-aberto.test.sql`. |
| D6 (D-11, P0-10) | Causa real: o cadastro aceitava preço de atacado sem quantidade mínima (gatilho). Sem gatilho, a faixa não é derivada e o preço fica no catálogo sem efeito na venda. Correção: regra única “preço e gatilho juntos” em `lib/gerente/paresAtacado.ts`, aplicada no schema do formulário (`app/gerente/produtos/produtoFormSchema.ts`) e na importação CSV (`lib/gerente/parseProdutoImportCsv.ts`). Teste: `lib/gerente/paresAtacado.test.ts`. |

**Ressalvas:**
- D2: com dois caixas abertos e venda de caixa fechado, o estorno em dinheiro é recusado. A solução definitiva é um parâmetro `caixa_id` na RPC de cancelamento (PR separado).
- D6: produtos já cadastrados com preço de atacado e sem gatilho continuam assim até serem editados. Antes de ir a produção, listar: `SELECT id, nome FROM produtos WHERE preco_atacado IS NOT NULL AND quantidade_gatilho_atacado IS NULL;`. A venda ignora esse preço até a correção.
- D6: a regra de preço de atacado do PDV (`precos_atacado`) não mudou; continua sendo a única fonte que a venda aplica.
- Testes SQL de D2 e D1/D3/D4/D5 não rodaram (sem Docker).

### Verificação em 2026-11-07 (sem Docker)

| Verificação | Resultado |
|---|---|
| `npm ci` (workspaces) | OK, 1464 pacotes |
| `tsc --noEmit -p tsconfig.typecheck.json` (pdv-importados) | OK, sem erros |
| Vitest: `app/caixa`, `components/gerente/produtos`, `app/gerente/produtos`, `lib/gerente` | 107 arquivos, 666 testes, todos passaram |
| Sintaxe das migrations D1, D2, D3, D4 (parte dos triggers), D5 em PostgreSQL 17 in-process (PGlite) sobre tabelas-stub | OK |
| Comportamento de D1, D2 e D3 nos triggers (PGlite, tabelas-stub) | OK. D2 expôs um bug real (`MIN(uuid)` inexistente), corrigido na migration |

**Não verificado:** os testes `d1-d3-...`, `d2-...` e `d4-d5-...` (fluxo completo pela RPC `finalizar_venda_transacional_canonica_v4` e pela RPC de cancelamento). Exigem o schema completo de homologação, que não reproduzo sem Docker. A RPC da venda e o wrapper de D4 não foram executados.

### Validação com Docker — 2026-11-07

Banco de trabalho: `d16_base` (cópia de `sec_gf01`, descartável, no contêiner local `supabase_db_fastproduct`). Nada em produção ou homologação.

| Verificação | Resultado |
|---|---|
| Docker operacional | PASSOU |
| Migrations D1, D3, D4, D5, D2 aplicadas em ordem | PASSOU |
| Rollbacks D2 → D5 → D4 → D3 → D1 em cópia `d16_rb` | PASSOU: triggers e colunas removidos; wrapper da v4 idêntico ao original (só diferença de fim de linha CRLF) |
| `d1-d3-fechamento-espera-quantidade-un.test.sql` | PASSOU (D1-1..4, D3-5..6) |
| `d2-estorno-dinheiro-caixa-aberto.test.sql` | PASSOU (D2-1..4). Corrigido: operador de venda precisa ser o usuário autenticado no teste |
| `d4-d5-troco-conta-pagamento.test.sql` | PASSOU (D5-1..3, D4-1..4). Corrigido: teste de conta inativa usava quantidade fracionada em produto UN |
| `go-live-01-golden-flow.test.sql` (regressão do PDV) | PASSOU (blocos 1–19). Falhava por design com D5: o fixture não tinha conta para PIX/cartão. Fixture ajustado com conta da loja A |
| Pré-checagem D3 (itens fracionados em UN) | 0 linhas no local |
| Pré-checagem D6 (preço de atacado sem gatilho) | 0 linhas no local |
| Pré-checagem D5 (lojas vendendo PIX/cartão sem conta ativa) | 1 loja no local (dados de teste). Produção: **NÃO TESTADO** (exige autorização) |
| Pré-checagem D4 (venda em dinheiro sem linha de pagamento) | 0 linhas no local (informativa) |
| E2E (Playwright, fase E) | **NÃO TESTADO**. Motivo: o GoTrue isolado (`auth`) não sobe sobre a cópia do banco (erro do migrador: `schema_migrations already exists`). Rodar contra o banco de desenvolvimento `postgres` alteraria o ambiente local compartilhado; não foi feito sem decisão |
