# Auditoria de Drift — Produção × Repositório × Aplicação

> **Documento de trabalho — somente diagnóstico.** Nenhuma alteração foi feita em produção.
> Data: 2026-06-20 · Projeto Supabase: `jinlong` (`kbabmewnahysfvlybiak`, Postgres 17) · Repo: `nocodenn-cell/fastproduct`.

---

## 1. Objetivo

Mapear as divergências (drift) entre três fontes que deveriam estar em paridade:

1. **Banco de produção** (schema realmente aplicado).
2. **Migrations do repositório** (`backend/supabase/migrations/`).
3. **Schemas usados pela aplicação** (`pdv-importados/`).

Entregar, por divergência: **impacto, risco, prioridade e estratégia de correção** — sem tocar em produção.

## 2. Metodologia e escopo

- **100% read-only.** Produção consultada via `SELECT`/`EXPLAIN` (MCP Supabase) e catálogo `pg_catalog`/`information_schema`/`supabase_migrations.schema_migrations`.
- Repositório: leitura de `backend/supabase/migrations/*.sql` (170 arquivos, `001`…`242`).
- Aplicação: busca de uso real (`grep`) sobre `pdv-importados/`.
- **Nenhuma migration foi criada/aplicada; nenhum objeto foi alterado.**

## 3. Resumo executivo

| Severidade | Achado |
|---|---|
| 🔴 **P0** | **Versionamento de migrations divergente** entre produção e repositório (numeração colidente, conteúdo diferente para o mesmo número, migrations só-produção e só-repo). Raiz de todo o resto. |
| 🟡 **P1** | `descontos_venda` em produção **não tem** `operador_id`/`aplicado_em` (repo migration `113`). |
| 🟡 **P1** | **Fiado**: produção aplicou `245_remover_venda_fiado`, mas a aplicação **ainda referencia** FIADO/`contas_receber`. Necessita verificação funcional. |
| 🟢 **P2** | `system_alerts` (repo `236`) **ausente** em produção. |
| 🟢 **P3** | `venda_finance_context` (repo `235`) **ausente** em produção — mas o app **não o consulta** em runtime. |

> A Auditoria Visual (Fase 2 · item 1) já é **resiliente** a estes drifts (ignora fontes ausentes) — nenhum deles a quebra.

---

## 4. Achado-raiz (P0): versionamento de migrations divergente

### Evidência

| Métrica | Produção | Repositório |
|---|---|---|
| Migrations registradas | **172** (`supabase_migrations.schema_migrations`) | **170** arquivos `.sql` |
| Formato das versões | **144 numéricas** + **28 timestamp** (`2026…`) | numérico sequencial `001`…`242` |

**Colisão de numeração com conteúdo diferente** (mesmo número, migrations distintas):

| Número | Produção (nome aplicado) | Repositório (arquivo) |
|---|---|---|
| `113` | `113_rls_audit_fixes` | `113_descontos_venda_auditoria_operador.sql` |
| `114` | `114_pdv_config_loja_backfill` | (outro conteúdo no repo) |

**Migrations só em produção** (não existem no repo — produção "à frente"):
`245_remover_venda_fiado`, `243_finalizar_venda_v4_sync_producao`, `244_consistencia_vendas_auditoria`, `264_dashboard_venda_eventos_kpis`, vários `block_v2_legacy_overloads…`, `stub_v3_full_overload…` etc.

**Migrations no repo não aplicadas em produção** (repo "à frente"):
`235_venda_finance_context_mirror`, `236_system_alerts_log_leve`, e o **conteúdo** da `113` do repo (auditoria de operador em descontos).

### Impacto
- Impossível garantir paridade prod↔repo: o número de uma migration **não identifica** o mesmo conteúdo nos dois lados.
- Deploys futuros via `supabase db push` podem **conflitar**, ser ignorados (número "já aplicado") ou **sobrescrever** objetos.
- Onboarding de novo ambiente a partir do repo **não reproduz** produção.

### Risco: **ALTO** · Prioridade: **P0**

---

## 5. Divergências de schema confirmadas

### 5.1 `descontos_venda` sem `operador_id` / `aplicado_em` (P1)

- **Produção:** colunas = `venda_id, gerente_id, desconto_percentual, desconto_valor`.
- **Repo espera (migration 113):** + `operador_id uuid` e `aplicado_em timestamptz`.
- **App:** a Auditoria Visual tenta ler `aplicado_em` (ignora a fonte por enquanto, via resiliência).
- **Impacto:** sem `aplicado_em` não há timestamp → descontos **não entram na timeline**; auditoria de "quem finalizou" incompleta (compliance).
- **Risco:** MÉDIO · **Prioridade:** P1.

### 5.2 Fiado removido em produção, ainda referenciado no app (P1)

- **Produção:** aplicou `245_remover_venda_fiado`.
- **App:** `FIADO`/`contas_receber` ainda referenciados em `app/gerente/clientes/actions.ts`, `app/gerente/financeiro/actions.ts`, `lib/gerente/financeiroTitulosServer.ts`.
- **Impacto:** possível incompatibilidade (UI/ação oferece fiado que o backend de venda não aceita mais). **Necessita verificação funcional** do escopo exato da remoção (forma de pagamento na venda vs. gestão de títulos existentes).
- **Risco:** MÉDIO · **Prioridade:** P1.

### 5.3 `system_alerts` ausente (P2)

- **Produção:** tabela **não existe** (repo `236` não aplicada).
- **Impacto:** observabilidade de anomalias (margem negativa, preço fora do padrão, estoque inconsistente) inexistente; Auditoria Visual não exibe alertas (degrada graciosamente).
- **Risco:** BAIXO (feature opcional, não-bloqueante) · **Prioridade:** P2.

### 5.4 `venda_finance_context` ausente (P3)

- **Produção:** tabela **não existe** (repo `235` não aplicada).
- **App:** referenciada **apenas** em `lib/supabase/database.types.ts` (tipos gerados) — **não consultada em runtime**.
- **Impacto:** baixo hoje; vira dívida se algum fluxo futuro depender do espelho financeiro.
- **Risco:** BAIXO · **Prioridade:** P3.

---

## 6. O que está alinhado (sem drift)

Verificado como **presente e compatível** entre produção, repo e app:

- Tabelas: `produtos` (todos os campos fiscais `ncm/cfop_produto/csosn/cest/cst_pis/cst_cofins` + `status_publicacao` + `preco_atacado/quantidade_gatilho_atacado/permitir_abaixo_custo`), `venda_eventos`, `vendas_canceladas_auditoria`, `movimentos_estoque_log`, `precos_atacado`, `contas_receber`, `ordens_compra`.
- `movimentos_estoque_log` usa **`usuario_id`** em **produção e repo** (índice `idx_movimentos_estoque_log_usuario_id`, migration 223) — **não é drift**. *(Correção de registro: um bug do código da Auditoria usava `gerente_id`, baseado em resumo incorreto de exploração; já corrigido para `usuario_id`.)*
- Função `finalizar_venda_transacional_canonica_v4` **presente** (alinhada à troca v3→v4 recém-mergeada no app). Convivem ainda overloads legados de `v2`/`v3` (marcados como bloqueados por migrations `block_v2_legacy_overloads…`).

---

## 7. Riscos consolidados

1. **Deploy de schema não-determinístico (P0):** sem fonte única de verdade, qualquer `db push` é arriscado.
2. **Compliance de auditoria parcial (P1):** descontos sem operador/timestamp.
3. **Inconsistência de produto (P1):** fiado no app vs. removido em produção.
4. **Dívida de features (P2/P3):** alertas e espelho financeiro existem no repo mas não em produção.

---

## 8. Estratégia de correção (proposta — **sem executar**)

Princípio: **reconciliar primeiro, depois evoluir.** Não tentar "reaplicar 235/236/113" cegamente — os números colidem com a história de produção.

**Fase A — Estabelecer fonte única de verdade (P0)**
1. Snapshot do schema real de produção: `supabase db pull` (gera migration baseline a partir do estado atual).
2. Adotar a baseline como **ponto zero** no repo (squash do histórico divergente), preservando os `.sql` antigos em `migrations/_archive/` para referência.
3. Migrar a numeração futura para **timestamp** (padrão Supabase) — elimina colisões.

**Fase B — Backport do que só existe em produção (P0)**
4. Trazer para o repo as migrations só-produção (`243/244/245/264/blocks…`) como parte da baseline, para o repo refletir a realidade.

**Fase C — Reaplicar deltas do repo que faltam em produção (P1/P2/P3)**
5. Reautorar como **novas migrations timestamp** (não reusar 113/235/236):
   - `descontos_venda`: `ADD COLUMN operador_id, aplicado_em` (P1).
   - `system_alerts` + triggers (P2).
   - `venda_finance_context` (P3) — só se algum fluxo passar a depender dele.
6. Decisão de produto sobre **fiado** (P1): alinhar app↔produção (remover do app ou restaurar em produção).

**Fase D — Prevenção (P0)**
7. **Gate de CI:** `supabase db diff` deve estar **vazio** antes de merge que toque schema.
8. Proibir hotfix direto em produção sem migration correspondente no repo.

> Todas as fases acima tocam o núcleo/banco e exigem **decisão e janela própria** — fora do escopo desta auditoria, que é só diagnóstico.

---

## 9. Próximo passo

Com este diagnóstico, decidir:
- **(a)** priorizar a **reconciliação de migrations (P0)** antes de seguir a Fase 2; ou
- **(b)** seguir com o próximo item da Fase 2 e tratar o drift em paralelo, sabendo que features que dependem de `113/235/236` ficam parcialmente inertes até a reconciliação.

A Auditoria Visual já está em produção e **não é bloqueada** por nenhum destes drifts.

---

## Adendo 1 — 2026-08-19: recorrência do P0 por aplicação manual em produção

> ⚠️ **Superado pelo Adendo 2, no fim deste documento.** A premissa de "aplicação manual em
> produção" foi **refutada**: a migration nunca esteve no ledger. Mantido como registro histórico.

> Acrescentado após a **Fase 6 do bloco financeiro**. O corpo acima permanece como o
> diagnóstico original de 2026-06-20 e não foi alterado.

O P0 da §3 — *"versionamento de migrations divergente entre produção e repositório"* —
**voltou a ocorrer, por um mecanismo novo**: uma migration foi **aplicada à mão em
produção** e, em seguida, **desabilitada no repositório** para que o pipeline não
tentasse reaplicá-la.

**Caso concreto:** `20260814015032_harden_diagnostics_and_ap_idempotency.sql`, renomeada
para `_disabled_20260814015032_…` nos commits `c3f58df3` e `35eb7e8d`, com a justificativa
*"já aplicada manualmente em produção"*.

### Por que isso é mais grave que o drift de numeração

O drift original era **visível**: números colidentes apareciam ao comparar os catálogos. Este
é **invisível pelas mesmas ferramentas** — o repositório fica internamente consistente e o
ledger de produção também. A divergência só existe *entre* os dois, e nada a sinaliza.

Consequências observadas na Fase 6:

1. **Produção deixou de ser reproduzível a partir do Git.** `supabase db reset` reconstruía
   um banco **sem** o fix P1-3, com a versão pré-fix de `registrar_pagamento_contas_pagar`.
   Qualquer disaster-recovery a partir do repositório produziria um banco diferente do real.
2. **O sintoma apareceu longe da causa.** As suítes de AP falhavam com `movement_reused` e
   `PAGAMENTO_SANGRIA_CORRELACAO_EXISTENTE` — erros que parecem de idempotência de
   aplicação, não de migration ausente.
3. **Mascarou um furo de RLS.** A migration desabilitada também revogava
   `relatorio_consistencia_vendas` de `PUBLIC`. Sem ela, e com a `20260818000001` revogando
   apenas `FROM authenticated`, a função seguiu executável por `authenticated` **via herança
   de PUBLIC** em produção. Ver [FASE_6_GATE_FINANCEIRO_VALIDACAO.md §5](docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md).

### Estado atual

A `20260814015032` foi **reabilitada** sob o nome original (PR
[#307](https://github.com/nocodenn-cell/fastproduct/pull/307)). É segura de reaplicar: só faz
`CREATE OR REPLACE FUNCTION` + `REVOKE`/`GRANT`, todos idempotentes.

### Pendente

**Não há garantia de que tenha sido a única.** A auditoria do ledger de produção contra
`supabase_migrations.schema_migrations` está registrada como item **7** do
[BACKLOG_TECNICO.md](docs/BACKLOG_TECNICO.md) e é **pré-requisito para agendar a janela
crítica**. Procurar também por outros arquivos `_disabled_*` em
`backend/supabase/migrations/` — cada um é potencialmente um objeto que existe em produção e
não no repositório.

### Regra a adotar

Migration aplicada à mão em produção **não deve ser desabilitada no repositório**. A
migration deve permanecer versionada e ativa, escrita de forma idempotente
(`CREATE OR REPLACE`, `IF NOT EXISTS`, `REVOKE`/`GRANT`), de modo que reaplicá-la onde já foi
aplicada seja no-op. Desabilitar troca uma falha ruidosa e reversível por uma divergência
silenciosa e permanente.

---

## Adendo 2 — 2026-08-19: a Fase 0 mediu o drift, e ele é sistêmico

> **Este adendo corrige o Adendo 1 acima e é a versão vigente do diagnóstico.**

### O que mudou em relação ao Adendo 1

O Adendo 1 afirma que a `20260814015032` foi **aplicada à mão em produção** e depois desabilitada
no repositório. **A premissa é falsa.** A migration **nunca esteve no ledger de produção** — não
foi aplicada de forma alguma. A justificativa registrada nos commits `c3f58df3` e `35eb7e8d`
(*"já aplicada manualmente em produção"*) estava **incorreta na origem**: alguém desabilitou uma
migration por acreditar que já estava aplicada, sem conferir `supabase_migrations.schema_migrations`.

A conclusão estrutural do Adendo 1 **permanece válida**, e por um caminho pior: com a migration
desabilitada, o fix P1-3 de AP não existia **em lugar nenhum** — nem no banco local reconstruído,
nem em produção. A "regra a adotar" do Adendo 1 continua correta e ganha um corolário:

> **Antes de desabilitar uma migration porque "já foi aplicada", consultar o ledger.** A crença de
> que foi aplicada não é evidência de que foi.

### Fase 0 — como o drift foi finalmente medido

O Adendo 1 registrava a auditoria do ledger como pendente. Ela foi executada em 2026-08-19 como
**Fase 0** do plano de fechamento, e foi além do ledger: comparou o **catálogo inteiro** dos dois
lados.

O instrumento é `backend/scripts/catalog-snapshot.sql` — um `SELECT` único que devolve
`(section, obj_key, digest)` para funções, tabelas, colunas, índices, constraints, triggers,
políticas RLS, views, enums, extensões e o ledger. O digest é md5 do conteúdo comparável; para
funções inclui `prosrc`, `proacl`, `prosecdef`, `provolatile`, `proconfig` e o tipo de retorno.
Objetos de extensão são excluídos via `pg_depend.deptype = 'e'` — sem isso, `pgcrypto` e `pg_trgm`
produziriam centenas de divergências falsas.

O mesmo SQL, byte a byte, rodou contra um `npx supabase db reset --local` (307 migrations + seed)
e contra produção, somente leitura.

**Validação do método:** o retrato do local foi tirado **antes e depois** de um `db reset` completo,
e os 11 digests de seção vieram **idênticos**. Isso prova que o script não tem falso-positivo
dependente de estado, e que o banco local já era reconstrução fiel do repositório — a divergência
medida **não é sujeira de ambiente**.

### O resultado

| Seção | Repositório | Produção | Δ |
|---|---:|---:|---:|
| policies | 129 | 144 | **+15** |
| columns | 851 | 866 | **+15** |
| indexes | 269 | 279 | **+10** |
| functions | 140 | 144 | **+4** |
| tables | 84 | 87 | **+3** |
| constraints | 401 | 403 | **+2** |
| migrations | 307 | 305 → **307** | paridade após PR #309 |
| extensions | 8 | 10 | +2 *(ruído de plataforma)* |
| enums | 2 | 2 | ✅ idêntico |
| triggers | 35 | 35 | ✅ idêntico |
| views | 12 | 12 | ✅ idêntico |

**8 das 11 seções divergem**, e a direção é consistente: **produção tem objetos que o repositório
não cria.** Três seções batem perfeitamente — não é caos generalizado, é divergência estruturada,
concentrada em funções, tabelas e autorização.

### A lição central

> **Paridade de chaves não implica paridade de catálogo.**

O ledger hoje bate em **307/307** — e os objetos não. A verificação que este documento e o item 7
do backlog propunham (`count(*)` do ledger contra `ls | wc -l`) teria dado **verde** sobre um banco
divergente em 10 funções, 3 tabelas e 15 políticas RLS. A conclusão do Adendo 1 de que "o P0 da
auditoria de junho está resolvido" valia **para a numeração, e só para ela**.

### Os achados que §4 previu

A §4 deste documento identificou colisão de numeração com conteúdo diferente nas migrations
`113`/`114`. **A Fase 0 encontrou a consequência viva dessa colisão:**

- **`fiscal_enfileirar_documento_venda`** — a Edge `sync-outbox` chama a RPC com **4 argumentos**
  (`p_loja_id`, com o comentário `// valida que a venda pertence à loja deste worker (migration 114)`);
  produção só tem a sobrecarga de **3**. O comentário é a evidência direta: produção executou uma
  `114` diferente da que está no repositório. PostgREST devolve `PGRST202`, e **o erro não falha o
  batch** — toda venda sincronizada do `pdv-local` deixaria de enfileirar documento fiscal, em
  silêncio. Dano até hoje **zero** (nenhuma venda do sync offline chegou a produção); arma no dia em
  que o `pdv-local` entrar.

- **`relatorio_consistencia_vendas(3 args)`** e outras funções criadas por migrations que **estão no
  ledger de produção** e cujos objetos não existem lá. Ou foram removidas à mão depois, ou o conteúdo
  daquela chave no repositório não é o que produção executou — e a segunda hipótese reencontra
  exatamente a §4.

### Consequência: a estratégia da §8 deixa de ser proposta e vira pré-requisito

A §8 deste documento propôs, em junho, uma reconciliação de baseline — e ela **nunca foi executada**.
A Fase 0 confirma que era o caminho certo, e que continua sendo o único:

1. `supabase db pull` — baseline a partir do estado real de produção;
2. baseline adotada como ponto zero do repositório, com os `.sql` antigos preservados;
3. deltas legítimos que hoje só existem no repositório reautorados sobre a baseline;
4. só então as correções de segurança e o gate de CI passam a significar alguma coisa.

Isso é a **Fase 1B** (itens 10–16 do [BACKLOG_TECNICO.md](docs/BACKLOG_TECNICO.md)).
**Pré-requisito não resolvido:** não há ambiente de ensaio — `create_branch` foi recusado
(branching exige plano Pro; a organização está no Free). Ver
[docs/AMBIENTES_E_RELEASE.md](docs/AMBIENTES_E_RELEASE.md) §1.

### O que já foi fechado

A PR [#309](https://github.com/nocodenn-cell/fastproduct/pull/309) aplicou em produção o que não
dependia da reconciliação completa: vazamento entre lojas fechado
(`verificar_consistencia_venda` e `relatorio_consistencia_vendas` restritas a
`postgres`/`service_role`), fix P1-3 da idempotência de AP no ar, ledger em paridade 307/307, e o
E2E fora de produção. **A Fase 1B não bloqueia o treinamento do cliente #1** (decisão do dono,
2026-08-19); bloqueia a **janela crítica** e a **segunda loja**.

### Referências

- [`docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md`](docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md) — auditoria completa da Fase 0
- [`docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md`](docs/FASE_6_GATE_FINANCEIRO_VALIDACAO.md) §4, §5.1, §8.3, §9.1
- [`GO_LIVE_CERTIFICATION_REPORT.md`](GO_LIVE_CERTIFICATION_REPORT.md) §14
- `backend/scripts/catalog-snapshot.sql` — instrumento de medição
