# Fase 3.1 — Plano de liberação (2026-11-05)

**Base:** `DRIFT_MIGRATIONS_MATRIZ_2026-11-05.md` (auditoria), `FASE3_1_PENDENCIAS_TECNICAS.md` (investigação) e `FASE3_1_COMPATIBILIDADE_CODIGO_BANCO.md` (código × banco).

**Estado:** nenhuma migration aplicada, nenhum registro, manifesto e gate inalterados. Este plano é para decisão e execução futuras.

---

## 1. Matriz de liberação

Legenda de **autorização**: **Dono** = decisão de produto ou de negócio; **Expressa** = autorização explícita antes de tocar produção; **Label** = o PR precisa de `deploy-prod:aprovado`.

| # | Migration | Problema resolvido | Dependências | Impacto nos dados (produção hoje) | Compatibilidade com o código | Testes em homologação | Rollback | Critérios de liberação | Autorização |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `20261028100000` token de gerente entre empresas | Vazamento de token entre tenants | Base da cadeia | Nenhum (2 tokens de desconto pendentes) | Compatível | `sec04-token-gerente-tenant` **passa** (local) | Captura de `pg_get_functiondef` antes; md5 | Suíte `sec04` verde em homologação; backup da função | Expressa + Label |
| 2 | `20261028110000` corte ADMIN | ADMIN com escopo global | 1 | 1 ADMIN, inativo; 0 vínculos ativos. **Faz UPDATE em `usuarios`** | `fp_pode_loja` é usada por guardas de todas as RPCs: risco de regressão ampla | Suíte de corte ADMIN e RPCs/RLS verdes em homologação | Rollback existe; backup de `usuarios` e `usuario_vinculos` antes | Suítes verdes; nenhum DONO/GERENTE sem acesso em homologação | Expressa + Label |
| 3 | `20261028120100` tokens de usuário inativo | Token de usuário inativo continua válido | 1, 2 | 2 tokens de desconto pendentes | Validação ao consumo pode recusar token legítimo se houver vínculo faltando (hoje: 0 casos) | 48 casos verdes em homologação, com contas reais | Rollback existe | 48/48; contas DONO e OPERADOR de teste operam normalmente | Expressa + Label |
| 4 | `20261028121000` provisionamento fail-closed | Provisionamento automático sem gate | 1; **decisão do dono sobre teste controlado** | Nenhum dado. **Bloqueia** `plataforma_iniciar_trial` | Trial deixa de funcionar; admin de provisionamento depende da contingência | Teste de atomicidade (C1–C7) e wizard (A–E) verdes; **a correção do achado 1.5 deve estar aplicada** | Rollback existe | Achado 1.5 corrigido; contingência testada; decisão do dono sobre o teste controlado | **Dono** + Expressa + Label |
| 5 | `20261028122000` RLS e custos | Custo e caixa de outra empresa visíveis a ADMIN | 2, 3 | Pré-condição verificada: 0 usuários ativos sem vínculo ativo | Altera 9 policies de RLS | Suíte de isolamento verde | Rollback existe | Pré-condição repetida no dia; suíte verde | Expressa + Label |
| 6 | `20261030100000` token de dispositivo | Venda offline com desconto de dispositivo | **3** (usa `fp_aprovador_ativo_na_empresa`) | Nenhum | Corrige o caminho que hoje recusa todo token de dispositivo | Venda offline aceita (token válido) e recusada (aprovador inativo) em homologação | Rollback existe (`20261030100000_…rollback.sql`) | Teste offline verde; **junto com o consumo único do token**: wrapper integrado localmente e testado (R1–R4); `sync-outbox` alterado no repositório, **não implantado** | Expressa + Label |
| 7 | `20261028101000` cobrança | Correções de segurança da cobrança; **pré-requisito da página do DONO** | Base 100000 (cabeçalho) | Nenhum dado; cria colunas e tabela de lock | **Página do DONO depende dela** (`fp_sou_dono_da_empresa`) | Não rodada: depende de `cobranca-planos-trial.test.mjs` | Existe no repositório; **não verificado** (ver seção 2) | **Decisão de produto** (seção 2) antes de qualquer SQL | **Dono** + Expressa + Label |
| 8 | `20261029155000` kardex `transferencia_id` | Rastreabilidade de transferência (#586) | Nenhuma | 75 linhas, 0 transferências. Nenhuma linha afetada | App não usa a coluna | `transferencia-id-kardex.test.sql` (CI) | **Sem arquivo no repositório**. Proposta não destrutiva no documento técnico (4.5) | Criar rollback **antes**; captura de md5 do corpo; janela de baixa carga para o índice | Expressa + Label |
| 9 | `20261030120000` NF-e conciliação | AP com valor diferente do documento | Antes de 10, 11 (mesma função, por texto) | Nenhum AP divergente hoje (9 parcelas, todas batem) | Compatível | Suíte de NF-e (**não executa hoje**: fixtures sem `empresa_id`) | Rollback existe | Suíte corrigida; casos do item 5.5 verdes | Expressa + Label |
| 10 | `20261030130000` NF-e precisão documental | Custo e exigível por item | 9; **depende de colunas que não existem em produção** (criadas pela própria migration) | Nenhum | Parser do app lê `vProd` (conferir versão do app em produção) | Suíte de NF-e | Rollback existe | Igual à 9, mais conferência do parser | Expressa + Label |
| 11 | `20261030140000` NF-e quantidade | Arredondamento silencioso de quantidade | 10 | Nenhum | Pode recusar NF-e legítima com quantidade de 4 casas (rara, erro explícito) | Suíte de NF-e, com caso de 4 casas | Rollback existe | Igual à 9 | Expressa + Label |

**Totais:** 11 migrations. **Pode prosseguir sem decisão adicional:** 1, 2, 3, 6 (após o consumo do token), 8 (após o rollback), 9–11 (após a suíte). **Depende do dono:** 4 e 7.

---

## 2. Cobrança (migration 101000) — análise de produto e engenharia

### 2.1 O que existe hoje em produção

- **Leitura da assinatura:** `fp_minha_assinatura` funciona. O DONO vê plano, status e faturas.
- **Gestão:** bloqueada. `fp_sou_dono_da_empresa` não existe, então `podeGerenciar = false`.
- **Contratação:** o autoatendimento está **desligado** por padrão (`lib/cobranca/autoatendimento.ts`). O caminho ativo é o pedido ao comercial (`commercial_solicitar_contratacao`), que **também não existe em produção** (GROWTH-001 adiada). **Não há caminho de contratação funcionando.**
- **Trial:** `plataforma_iniciar_trial` existe e cria empresa, loja e DONO com 15 dias de teste. Ao aplicar a 121000, passa a ser bloqueado pelo interruptor.

### 2.2 RPCs de cobrança e o que cada uma faz

| RPC | Função |
|---|---|
| `cobranca_registrar_assinatura` | Cria ou troca assinatura; upgrade vira `*_pendente` até o pagamento |
| `cobranca_reservar_assinar` / `cobranca_liberar_assinar` | Lock de 120 s por empresa: dois cliques ou abas não geram duas cobranças no Asaas |
| `cobranca_aplicar_evento` | Webhook do Asaas. Idempotente por `evento_id` (`saas.webhook_eventos`): reenvio devolve o resultado gravado. Aplica `*_pendente` em `PAYMENT_CONFIRMED`/`RECEIVED`; estorno e chargeback suspendem |
| `cobranca_conciliar_pagamento` / `cobranca_assinaturas_para_conciliar` | Conciliação com o Asaas |
| `cobranca_processar_vencimentos` | Trial vencido → `SUSPENSA`; inadimplente após carência e com fatura `VENCIDA` → `SUSPENSA`. Downgrade é aplicado na hora |
| `cobranca_cancelar` / `cobranca_reativar` / `cobranca_suspender` | Ciclo de vida |
| `cobranca_liberar_venda_offline` | Liberação de venda offline quando suspensa |
| `fp_sou_dono_da_empresa` | Confere DONO **da empresa** (vínculo), não perfil global |

### 2.3 Estados

`TRIAL` → (pagamento) → `ATIVA` → (fatura vencida + carência) → `INADIMPLENTE` → `SUSPENSA`; `TRIAL` vencido → `SUSPENSA`; qualquer um → `CANCELADA`. Faturas: `PENDENTE`, `VENCIDA`, pagas. Mudança de plano: `*_pendente` até confirmação.

### 2.4 Idempotência e falhas

- **Webhook:** idempotente pela chave `evento_id`. Evento de empresa desconhecida fica registrado com `resultado = 'empresa_desconhecida'`, sem efeito.
- **Assinatura:** lock de 120 s por empresa. Como um lock expirado é substituído na reserva seguinte **não foi verificado** nesta etapa.
- **Renovação:** `cobranca_processar_vencimentos` é o gatilho. Não foi verificado o agendamento (cron/Edge). **Pendente.**
- **Falha no Asaas:** a assinatura local pode ficar em `PENDENTE` sem fatura confirmada. A regra de suspensão exige fatura `VENCIDA` confirmada pelo Asaas, então uma falha transitória não suspende cliente.

### 2.5 Produto

- **Decisão 1 — contratação:** manter autoatendimento desligado (contratação pelo comercial) ou ligar. A escolha define se `commercial_solicitar_contratacao` (GROWTH-001) é necessária **agora**.
- **Decisão 2 — trial:** o trial de 15 dias é compatível com o provisionamento fechado (121000)? Se a 121000 entrar, o trial para. É preciso escolher: (a) trial pelo hub comercial, com o mesmo mecanismo, ou (b) suspender o trial até o hub.
- **Decisão 3 — gestão do DONO:** a página hoje mostra "Somente o DONO gerencia" para um DONO real. A correção mínima é `fp_sou_dono_da_empresa` (101000), e isso **não** depende da contratação.
- **Decisão 4 — revisão de cobrança:** a 101000 contém correções de segurança (upgrade só após pagamento, estorno suspende, lock). Vale aplicar isso mesmo sem autoatendimento.

### 2.6 Recomendação

1. **Separar a 101000 em duas partes:** (a) funções de checagem de DONO e lock, que a página precisa; (b) a parte de cobrança e webhook. A parte (a) pode entrar com baixo risco. A parte (b) só com decisão de produto e teste com o Asaas em sandbox.
2. **Não ligar o autoatendimento** antes de GROWTH-001 e do fluxo de contratação ser validado ponta a ponta.
3. **Testar** `cobranca-planos-trial.test.mjs` no ambiente de CI antes de qualquer liberação.

---

## 3. Sequência de execução

Cada etapa só começa com a anterior verificada em homologação. Cada migration é aplicada **uma por vez**, com captura de corpo e verificação, e só então registrada com `supabase migration repair --status applied <versão do arquivo>`.

**Etapa 0 — pré-requisitos (sem produção)**
- Corrigir a suíte de NF-e (fixtures com `empresa_id`).
- Aplicar o achado 1.5 (rascunho pronto e testado em `fase31-propostas/`) como migration própria, revisada.
- Revisar e transformar em migration: `token_desconto_consumo_unico_offline.sql` e `registrar_venda_offline_com_token.sql` (ambos em `fase31-propostas/`). Testar payload alterado.
- Implantar **nesta ordem**: migrations primeiro (tabela de consumo e funções), depois a Edge Function `sync-outbox` (deploy manual, governança). Trocar a ordem deixa o PDV com a chamada a uma RPC inexistente.
- Criar o rollback da 155000.
- Montar um banco de homologação com snapshot de produção e rodar a cadeia inteira.

**Etapa 1 — segurança (Expressa + Label)**
1. 100000 → registrar
2. 110000 → registrar (backup antes)
3. 120100 → registrar
4. 1030100000 + consumo do token → registrar
5. 122000 → registrar

**Etapa 2 — NF-e (Expressa + Label)**
6. 120000 → 130000 → 140000, cada uma registrada, após a suíte verde e a conferência das seis NF-e não finalizadas

**Etapa 3 — operacional (Expressa + Label)**
7. 155000 → registrar, após o rollback e em janela de baixa carga

**Etapa 4 — decisões do dono**
8. 121000 — após o achado 1.5 e a decisão sobre o teste controlado
9. 101000 — após as decisões de produto da seção 2.5

**Critério de encerramento do drift:** cada migration aplicada aparece em `schema_migrations` com a versão do arquivo. Qualquer migration adiada entra em `deferred-migrations.json` com `releaseCondition` explícita, por decisão do dono. Nenhum registro sem aplicação.

---

## 4. Critérios de liberação (resumo)

- Testes em homologação verdes para a migration, com resultado anexado.
- Rollback criado, testado e com md5 do corpo registrado.
- Compatibilidade com o código verificada (ver `FASE3_1_COMPATIBILIDADE_CODIGO_BANCO.md`).
- Impacto nos dados conferido no dia da aplicação (contagens e pré-condições).
- Autorização expressa do proprietário e label `deploy-prod:aprovado` no PR.
- Backup lógico das tabelas afetadas.

---

## 5. Rollbacks — situação

| Migration | Rollback no repositório | Testado | Observação |
|---|---|---|---|
| 100000, 110000, 120100, 121000, 122000, 101000, 1030100000, 120000, 130000, 140000 | Existe (`backend/supabase/rollback/`) | **Não** executado nesta etapa | Verificar cada um antes da aplicação |
| 155000 | **Não existe** | — | Criar; proposta no documento técnico (4.5) |

---

## 6. Relatório executivo

**Pronto para liberar após homologação:** cadeia de segurança 100000 → 110000 → 120100 → 122000 (o teste `sec04` passa localmente); suíte de atomicidade do provisionamento com correção testada (7/7).

**Bloqueado por correção técnica:**
- Vendas offline com desconto: falta o consumo único do token. Sem ele, um token autoriza várias vendas.
- NF-e: suíte de testes não executa; a correção financeira (120000) não pode ser validada hoje. O defeito é latente: os dados atuais batem.
- Kardex: sem rollback no repositório.
- Provisionamento: achado 1.5 (reatribuição de usuário existente).

**Depende de decisão do proprietário do produto:**
1. Teste controlado de provisionamento em produção (121000).
2. Trial após a 121000: manter pelo hub ou suspender até o hub.
3. Autoatendimento de contratação: ligar agora (exige GROWTH-001) ou manter pelo comercial.
4. Revisão de cobrança (101000): aprovar a separação da seção 2.6.
5. Validade do token offline.

**Impacto operacional hoje, sem nenhuma migration:**
- Vendas offline com desconto de gerente **falham** no PDV (RPC ausente).
- DONO **não gerencia** a assinatura (RPC ausente), e a mensagem de erro é enganosa.
- **Não há contratação** funcionando (commercial ausente, autoatendimento desligado).

Esses três itens existem hoje em produção e são corrigidos pela liberação, não pela espera.
