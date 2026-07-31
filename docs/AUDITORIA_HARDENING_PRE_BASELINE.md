# Auditoria de Hardening pré-baseline — execução

**Aberto:** 2026-07-29 · **Alvo:** projeto Supabase `jinlong` (`kbabmewnahysfvlybiak`)
**Contexto:** correções aplicadas ANTES do `supabase db pull` que gera o baseline do PROD novo.

> **Por que "antes do baseline":** o `db pull` é um `pg_dump` — ele transcreve GRANTs junto
> com o schema e não distingue decisão de acidente. Qualquer permissão indevida que sobre
> no `jinlong` vira "verdade canônica" no PROD. O que for corrigido antes existe nos dois
> ambientes por construção; o que ficar para depois precisa ser aplicado duas vezes, e é
> aí que ambientes divergem.

---

## Status dos itens

| ID | Item | Severidade | Status | Migration |
|---|---|---|---|---|
| **C-1** | `finalizar_venda_transacional_canonica_v4` executável por `anon` | 🔴 Crítico | ✅ **Resolvido** | `277` |
| **B-1** | 14 funções executáveis por `anon` / 15 por `authenticated` sem uso público | 🟠 Alto | ✅ **Resolvido** | `278` |
| **B-2** | `marcas.marcas_leitura` — policy `SELECT` sempre verdadeira | — | ✅ **Falso positivo** | — |
| **DB-07** | CHECKs matemáticos ausentes | 🟠 Alto | ✅ **Resolvido** | `279` |
| **DB-01** | `chave_fiscal` sem CHECK de formato | 🔴 Crítico | ✅ **Resolvido** (parcial) | `280` |
| **DB-16** | `gtin_lookup_cache` — 3 policies always-true | 🟡 Médio | ✅ **Reclassificado + endurecido** | `281` |
| **A-3** | RPCs `fiscal_*` abertas a `authenticated` | 🟠 Alto | ✅ **Resolvido** | `282` |
| **DB-14** | `'FIADO'` legado em listas-enum | 🟡 Médio | ✅ **Resolvido** | `283`, `284` |
| DB-17 | 3 tabelas com RLS e 0 policies | 🔵 Baixo | 📋 Documentado, sem ação | — |
| DB-13 | `movimentos_caixa` duplicada / `venda_engine_shadow_runs` órfã | 🔵 Baixo | 📋 Pós-baseline | — |
| — | `DROP` dos overloads legados `v2`/`v3` | 🔵 Baixo | 📋 Pós-baseline | — |

### Resultado consolidado da FASE 1

| Métrica | Antes | Depois |
|---|---:|---:|
| `SECURITY DEFINER` executáveis por `anon` | **11** | **0** |
| Funções executáveis por `anon` (total) | 36 | 22 (todas `SECURITY INVOKER`) |
| RPCs `fiscal_*` executáveis por `authenticated` | 10 | 3 (só as chamadas pelo app) |
| CHECKs em `vendas` | 8 | 9 |
| CHECKs em `itens_venda` | 2 | 7 |
| CHECKs em `gtin_lookup_cache` | 1 | 3 |
| Constraints com `'FIADO'` em lista-enum | 3 | **0** |
| Tabelas do fluxo financeiro com guarda `nao_fiado` | 2 | 3 |

**8 migrations aplicadas** (277–284). Nenhum corpo de RPC alterado. Nenhuma função removida.
Nenhum dado de negócio modificado. `service_role` preservado em todas as revogações.

---

## 277 — `REVOKE anon` em `finalizar_venda_transacional_canonica_v4`

**Problema.** A RPC canônica de finalização de venda (`SECURITY DEFINER`, ignora RLS)
tinha `EXECUTE` para `anon` por duas concessões independentes: `=X` (PUBLIC herdado na
criação) e `anon=X` (grant explícito).

**Origem — regressão rastreável.** A migration `268` revogou `FROM PUBLIC` sobre a
assinatura de 19 argumentos. A `272` (BL-1) acrescentou `p_motivo_desconto` e
`p_motivo_descricao`; no Postgres, `CREATE OR REPLACE` com novos parâmetros cria uma
**função nova**, que nasce com `EXECUTE` para PUBLIC — e a `272` ainda concedeu
`TO authenticated, anon` explicitamente (linhas 448-452). A `274` repetiu (613-617).

**Impacto fechado.** A função resolve o ator com `COALESCE(auth.uid(), p_operador_id)` e
não consulta `public.usuarios` nem verifica `perfil`. Como a anon key é pública por
construção, um `POST /rest/v1/rpc/` não autenticado gravava venda, baixava estoque,
movimentava caixa e enfileirava documento fiscal.

**Validação:**
```
anon=false · authenticated=true · service_role=true
acl: {postgres=X, authenticated=X, service_role=X}
SET LOCAL ROLE anon → has_function_privilege = false
hash do corpo inalterado: 2c235906df4bc80a7cf95c01aeb5be3f
```

---

## 278 — `REVOKE anon/authenticated` em funções sem uso público

**Problema.** 14 funções alcançáveis por `anon` e 15 por `authenticated`, quase todas por
herança de `PUBLIC` (`=X` em `proacl`), nunca revogada. Mesma causa raiz do C-1.

**Dependências verificadas antes de escrever** — `pg_policies`, `pg_trigger`,
`pg_get_functiondef`, `pg_views` e grep no código:

| Grupo | Funções | `anon` | `authenticated` | Evidência |
|---|---|---|---|---|
| A | `auth_usuario_gerencial_loja` | revogado | **preservado** | usada em **6 policies RLS** |
| A | `pdv_config_flags_visuais` | revogado | **preservado** | 3 chamadas, todas autenticadas |
| B | `fn_criar/atualizar/desativar_funcionario` | revogado | revogado | app usa só `createAdminClient()` |
| C | `fn_audit_update_funcionarios_meta`, `registrar_historico_preco_produto` | revogado | revogado | funções de trigger |
| D | `venda_eventos_items_from_payload/from_sale`, `calcular_promocao_aplicavel` | revogado | revogado | chamadas de dentro de `SECURITY DEFINER` |
| E | `v2` (4 assinaturas), `v3` (2), `finalizar_venda_transacional(7)` | revogado | revogado | corpo `LEGACY_DISABLED_USE_V4` |

**Achado novo:** existiam **overloads-stub de 0 argumentos** de `v2()` e `v3()`,
concedidos a `anon` — artefatos de desativação que ninguém revogou.

**Deliberadamente fora do escopo.** `finalizar_venda_transacional(uuid,uuid,text,numeric,
numeric,numeric,jsonb,text,numeric)` — a de 9 argumentos — **não** é `LEGACY_DISABLED`
(é `SECURITY DEFINER` ativa) e `anon` já estava negado. Não foi possível provar ausência
de uso; permanece intacta. **Item aberto para verificação.**

### Testes de regressão executados

1. **Policies RLS que dependem de `auth_usuario_gerencial_loja`** — como `authenticated`,
   leitura de `implantacao_checklists` e `implantacao_checklist_itens` sem `42501`.
2. **`pdv_config_flags_visuais()`** — executada por `authenticated`, retornou 1 linha.
3. **v4 continua executável por `authenticated`** — `true`.
4. **Trigger dispara sem `EXECUTE`?** — teste empírico, não presunção. Sob o papel
   `authenticated`, um `UPDATE` em `produtos` disparou `registrar_historico_preco_produto`
   (histórico 0 → 1) mesmo com o `EXECUTE` revogado. Confirma a semântica do Postgres:
   o privilégio é checado em `CREATE TRIGGER`, não ao disparar. Transação abortada via
   `RAISE EXCEPTION`; rollback verificado (histórico de volta a 0, `produtos` = 109).

### Resultado

| Métrica | Antes | Depois |
|---|---:|---:|
| `SECURITY DEFINER` executáveis por `anon` | **11** | **0** |
| Funções executáveis por `anon` (total) | 36 | 22 |

As 22 restantes são **todas `SECURITY INVOKER`** — não fazem bypass de RLS, executam com
privilégio do chamador. Como `anon` não tem DML (migration 219) nem leitura efetiva,
falham na prática. Risco residual baixo; higiene futura.

---

## 279 — CHECKs matemáticos (DB-07)

Verificação prévia com **igualdade exata**: 0 violações em 56 vendas e 56 itens.

**Correção de previsão:** a auditoria anterior afirmava que "2 linhas de seed violariam o CHECK".
Errado — aquela inconsistência é **entre tabelas** (cabeçalho `total_desconto` = 12,50 vs soma
das linhas = 0), e CHECK é intra-linha por definição. As 2 vendas satisfazem 125,00 − 12,50 = 112,50.

**Excluída deliberadamente:** a igualdade estrita `preco_unitario = original − desconto`.
A v4 calcula `v_desconto_unitario := GREATEST(0, v_preco_original - v_preco_unitario)` — o clamp
em 0 quebra a identidade em cenário de **acréscimo**. Impor a igualdade rejeitaria acréscimo,
que é regra de negócio. Entrou a versão fraca: `desconto_unitario <= preco_unitario_original`.

**Invariante não expressável:** `vendas.total_desconto = SUM(itens.quantidade * desconto_unitario)`
é entre tabelas; exigiria trigger. Registrado como dívida — é o que as 2 vendas de seed violam.

**Segundo escritor:** `registrar_venda_com_itens` (PDV offline) insere `p_total_liquido` direto do
parâmetro. A constraint passa a validá-lo. Trade-off aceito: sync travado e detectável é melhor
que ledger incoerente e silencioso.

Testes: venda coerente ACEITA · venda incoerente REJEITADA · **acréscimo ACEITO** · desconto negativo REJEITADO.

## 280 — Formato de chave fiscal (DB-01)

`NOT VALID` **sem validar** — há 1 linha histórica violadora (`CHAVE-SMOKE-123`), e apagá-la
está fora desta frente. Escritas novas são bloqueadas; executar `VALIDATE CONSTRAINT` após o
expurgo do DB-03.

`vendas_chave_nf_check` reforçado de `length = 44` para **44 dígitos** (0 linhas afetadas).

⚠️ **Consequência deliberada:** `fiscal-provider-adapter.ts:81` gera `NFE-MOCK-...`, e
`FISCAL_PROVIDER_TYPE` tem default `"mock"`. A constraint faz a emissão mock **falhar no banco**
em vez de gravar documento EMITIDO com chave falsa — exatamente o "dano irreversível" do B-6.
Smoke tests fiscais com mock passam a falhar; a correção certa é um provider sandbox com chave
de 44 dígitos, **não** enfraquecer a constraint.

Testes: chave 44 dígitos ACEITA · chave mock REJEITADA · NULL ACEITA (fila fiscal intacta) · 44 letras REJEITADA.

## 281 — `gtin_lookup_cache` (DB-16) — reclassificado

O advisor sinaliza `rls_policy_always_true`, mas **não procede como falha de isolamento**:
a tabela não tem `loja_id` (GTIN é identificador universal), as policies são escopadas
`TO authenticated`, e `anon` não tem grant algum. A escrita autenticada é o funcionamento da
feature — `sugestaoCadastroActions.ts` usa `createClient()`; restringir quebraria o cadastro por
código de barras.

Resíduo real — envenenamento por insider — exigiria restringir **quem cadastra produto**, que é
decisão de produto. Fora do escopo. A migration não muda **quem** escreve; muda **o que** pode ser
escrito: GTIN de 8–14 dígitos e TTL coerente.

## 282 — RPCs fiscais (A-3)

Mapeamento antes de revogar: o worker cria cliente com `SUPABASE_SERVICE_ROLE_KEY`
(`fiscal-worker/index.ts:24`); o app usa `createClient()`. `processarFilaFiscalAgora` invoca a
edge function por **HTTP** com `X-FISCAL-WORKER-KEY`, não por RPC — por isso o claim pôde sair de
`authenticated`.

7 assinaturas restritas a `service_role`, incluindo `fiscal_marcar_emitido` (que gravava
status EMITIDO com chave arbitrária). 3 preservadas para o app.

**Fecha metade do D-1:** o overload `fiscal_reprocessar_documento(uuid,text)` — sem verificação de
perfil e sem chamador no código — perdeu `authenticated`. A outra metade (colunas inexistentes /
`DROP`) fica para pós-baseline.

## 283 / 284 — `'FIADO'` legado (DB-14)

A migration 246 removeu a venda fiado acrescentando constraints de bloqueio, sem corrigir as
listas-enum. `vendas` e `vendas_pagamentos` tinham a contradição, mas o efeito líquido era correto
(constraint irmã bloqueava).

**`devolucoes` era pior e escapou do meu escopo inicial** — foi a verificação final pós-283
(esperava 0, encontrou 1) que expôs. Ali **não havia constraint irmã**: a lista-enum era a única
guarda e aceitava `'FIADO'`. O caminho de devolução podia gravar forma de pagamento que o caminho
de venda rejeita. Lacuna funcional residual da 246, não ruído de schema.

284 também acrescenta `devolucoes_forma_nao_fiado`, dando às três tabelas do fluxo financeiro a
mesma dupla de guardas.

---

## Itens abertos

| # | Pendência | Bloqueia baseline |
|---|---|:---:|
| 1 | `documentos_fiscais_chave_formato` está `NOT VALID` — rodar `VALIDATE CONSTRAINT` após o expurgo do DB-03 | Não |
| 2 | `finalizar_venda_transacional(9 args)` — não é `LEGACY_DISABLED` e não foi possível provar ausência de uso. `anon` já negado | Não |
| 3 | 22 funções `SECURITY INVOKER` alcançáveis por `anon` — higiene de grants | Não |
| 4 | `DROP` dos overloads legados `v2`/`v3` — exige checagem de dependências | Não (pós-baseline) |
| 5 | `movimentos_caixa` (0 linhas, duplica `movimentacoes_caixa`) e `venda_engine_shadow_runs` (órfã) | Não (pós-baseline) |
| 6 | `importacoes_nfe.chave_acesso` sem CHECK — fluxo de importação não auditado | Não |
| 7 | **Envenenamento de `gtin_lookup_cache` por insider** — exige decisão sobre quem cadastra produto | Não — **decisão de produto** |
| 8 | **Invariante cabeçalho × soma das linhas** — exigiria trigger, muda caminho de escrita | Não — **decisão de arquitetura** |

### DB-17 — analisado, sem ação

`produto_create_requests`, `gerente_auth_attempts` e `gerente_auth_rate_limits` têm RLS ligada e
0 policies. Isso **já nega tudo** para papéis não-proprietários — é negação por omissão, e
funciona. Acrescentar policy explícita não aumenta a segurança e introduz risco de, por engano,
*conceder* acesso. Decisão: documentar, não alterar.

---

## Correções de classificação (registro honesto)

- **`search_path` mutável em 4 funções** — classificado como risco nas auditorias
  anteriores. Verificado `prosecdef` uma a uma: `finalizar_venda_transacional(7)`,
  `v2()`, `v3()` e `venda_evento_idempotency_key` são **todas `SECURITY INVOKER`**.
  Rodam com privilégio do chamador; não há escalação possível. **Rebaixado para aceitável.**
- **DB-04** (`pdv_config` sem senha de gerente) — a "segunda loja" é uma loja de smoke
  test (`Smoke Homolog 1784432057537`), não uma loja real mal configurada.
  **Rebaixado de Alto para Baixo**; some junto com o expurgo das lojas de teste.
- **`estoque` sem unicidade** — errado. Existe o índice único
  `estoque_loja_produto_unique (loja_id, produto_id)`; não aparece em `pg_constraint`
  por ser índice, não constraint. **0 duplicidades, 0 negativos.**
