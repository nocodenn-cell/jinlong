# Plano de Reconciliação de Migrations — Single Source of Truth

**Objetivo:** eliminar definitivamente o drift entre o banco `jinlong` (produção) e o repositório, de forma que `supabase db reset && supabase migration up` reproduza **exatamente** o schema de produção, sem duplicatas, órfãs ou equivalentes.

**Status:** PLANO — nenhuma alteração executada. Aguarda aprovação.

---

## 1. Auditoria — Estado Atual

### 1.1 Mecanismo-raiz do drift (por que aconteceu)

| Lado | Esquema de versão | Rastreamento |
|------|-------------------|--------------|
| **Repositório** | Prefixo **numerado** (`258_`, `259_`…) — 187 arquivos + 11 timestamped = 198 | Arquivos em `backend/supabase/migrations/` |
| **Banco live** | Versão **timestamp** (`20260707183145`) com nome numerado embutido | `supabase_migrations.schema_migrations` — **apenas 12 entradas** |

**Causa:** as migrations recentes foram aplicadas via CLI/MCP (`apply_migration`), que atribui **versão timestamp** no momento da aplicação — independente do número no nome. O repo, porém, versiona por **número de arquivo**. Como resultado:
- O `schema_migrations` remoto tem timestamps que **nunca batem** com os números do repo → `migration-remote-drift` acusa diferença.
- Toda a **base ≤254 (186 arquivos)** existe no banco mas **não está em `schema_migrations`** → é história "não rastreada": um `db reset` a partir do repo tentaria reaplicar tudo, mas o remoto acha que só 12 foram aplicadas.
- Números foram **reutilizados** para conteúdos diferentes (259 = 3 coisas distintas).

### 1.2 Tabela de auditoria — 12 migrations rastreadas no banco vs repo

| # | Migration no Banco (versão / nome) | Migration no Repo | Mesmo conteúdo? | Diagnóstico | Ação |
|---|-----------------------------------|-------------------|-----------------|-------------|------|
| 1 | `20260707183145` 258_produtos_localizacao_nome_reduzido | `258_produtos_localizacao_nome_reduzido.sql` | ✅ (nome+número) | **MATCH** | absorver no baseline |
| 2 | `20260709184734` 259_historico_precos_produto | só em PR **#148** (não mergeada) | ⚠️ ausente na branch | **ÓRFÃ p/ branch** (existe em prod) | capturar no baseline |
| 3 | `20260710163032` 255_vendas_em_espera_e_consulta_rapida | `247c_vendas_em_espera_e_consulta_rapida.sql` (mesmo conteúdo) + repo `255_` = grant_baseline (**outro** conteúdo) | ⚠️ número 255 sobreposto | **EQUIVALENTE renumerada + COLISÃO** | baseline |
| 4 | `20260710212200` 263_vendas_cliente_id | `259_vendas_cliente_id.sql` | ✅ equivalente | **RENUMERADA** (263↔259) | baseline |
| 5 | `20260710212305` 264_finalizar_venda_canonica_v4_cliente_id | `260_finalizar_venda_v4_com_cliente.sql` (+`268` unifica guard) | ✅ equivalente | **RENUMERADA/RENOMEADA** | baseline |
| 6 | `20260710212349` **265_clientes_insert_operador_pdv** | ❌ **ausente no repo** | — | **ÓRFÃ (prod-only)** — policies RLS de `clientes` | capturar no baseline |
| 7 | `20260710212628` **266_clientes_unique_documento_loja** | ❌ **ausente no repo** | — | **ÓRFÃ (prod-only)** — índice único `clientes(loja_id,documento)` | capturar no baseline |
| 8 | `20260711015958` 259_funcionarios_separate_from_usuarios | `262_funcionarios_separate_from_usuarios.sql` | ✅ equivalente | **RENUMERADA** (259↔262) | baseline |
| 9 | `20260711020021` 260_comissoes_regras_funcionario | `263_comissoes_regras_funcionario.sql` | ✅ equivalente | **RENUMERADA** (260↔263) | baseline |
| 10 | `20260711020053` 261_comissoes_vendedores_regra_e_congelamento | `264_comissoes_vendedores_regra_e_congelamento.sql` | ✅ equivalente | **RENUMERADA** (261↔264) | baseline |
| 11 | `20260711143312` 267_funcionarios_meta_crud | `267_funcionarios_meta_crud.sql` | ✅ (nome+número) | **MATCH** | baseline |
| 12 | `20260711230618` 088_produto_imagens_storage_bucket | `088_produto_imagens_storage_bucket.sql` | ✅ (aplicada hoje) | **MATCH** | baseline |

### 1.3 Classificação consolidada

- **Órfãs prod-only (schema em prod, ausente do repo):** `265_clientes_insert_operador_pdv`, `266_clientes_unique_documento_loja`. **Risco máximo** — um `db reset` a partir do repo NÃO recria esses objetos → schema divergente.
- **Órfã relativa à branch:** `259_historico_precos_produto` (aplicada em prod; arquivo vive só na PR #148 não-mergeada).
- **Equivalentes renumeradas (mesmo conteúdo, número diferente):** vendas_cliente_id, funcionarios_separate, comissoes_regras, comissoes_vendedores, finalizar_v4_cliente, vendas_em_espera.
- **Números reutilizados / colisões:** `259` (3 conteúdos), `255` (2 conteúdos), `260/261/263/264` cruzados entre os dois lados.
- **Base não-rastreada:** 001–254 (186 arquivos) no repo e no banco, ausentes de `schema_migrations`.

**Conclusão da auditoria:** o esquema numerado + rastreamento timestamp parcial + aplicações manuais tornaram o histórico **irreconciliável arquivo-a-arquivo**. Não há renumeração que conserte — a linearidade foi perdida em ambos os lados.

---

## 2. Fonte Oficial (decisão por conteúdo, não por número)

**A fonte de verdade do SCHEMA é o banco de produção `jinlong`.** Justificativa:
- É o estado real que atende o cliente (dados + schema vivos).
- Contém objetos que o repo não tem (órfãs 265/266) — descartá-los quebraria a produção.
- As "equivalentes renumeradas" já estão materializadas nele no estado final correto.

O repositório deixa de ser "a soma de 198 migrations incrementais" e passa a ser **um baseline que espelha o schema de produção** + migrations futuras rastreadas.

---

## 3. Estratégia: BASELINE SQUASH (única que satisfaz todos os critérios)

### Por quê baseline (e não realinhar os 198 arquivos)
Realinhar/renumerar preservando os 198 arquivos **não** garante `db reset == prod` (aplicações manuais, base não-rastreada, órfãs) e **não** elimina o esquema numerado quebrado. O baseline garante reprodução **por construção**.

### Passos (todos gated por aprovação; verificação antes de qualquer ato destrutivo)

**Passo 0 — Prova de equivalência (não-destrutivo).**
Para cada uma das 12 migrations rastreadas, comparar `schema_migrations.statements` (SQL real aplicado) com o arquivo do repo correspondente. Persistir o diff. Isto **documenta** que "renumeradas" são de fato equivalentes e identifica qualquer diferença real antes de prosseguir.

**Passo 1 — Gerar o baseline a partir da produção (não-destrutivo).**
`supabase db dump --schema public,storage,auth-relevant` (ou `pg_dump --schema-only`) do `jinlong` → `backend/supabase/migrations/00000000000000_baseline_prod.sql`.
Por construção, este arquivo **é** o schema de produção.

**Passo 2 — Verificar o baseline reproduz prod (não-destrutivo).**
Aplicar o baseline num banco **shadow/local** (nunca em prod) → comparar via `supabase db diff` (ou `generate_typescript_types` dos dois) → diff **vazio** = prova de reprodução fiel. Só avança se vazio.

**Passo 3 — Arquivar histórico legado (não-destrutivo p/ prod).**
Mover os 198 arquivos para `backend/supabase/migrations_archive/` (preservados para auditoria; fora do caminho ativo). O caminho ativo `migrations/` passa a conter **só** o baseline.

**Passo 4 — Reparar o `schema_migrations` remoto (metadata-only, NÃO altera schema/dados).**
Substituir as 12 entradas por **uma** entrada baseline (`00000000000000` / `baseline_prod`), refletindo que o estado atual = baseline. Isto toca **apenas a tabela de tracking** — nenhuma tabela de negócio, nenhum dado, nenhum objeto de schema é alterado. Reversível (backup das 12 linhas antes).

**Passo 5 — Determinismo.**
A partir daqui: `supabase db reset` aplica só o baseline → schema idêntico a prod. `migration up` num prod real é no-op (já no baseline). Deploys voltam a ser determinísticos.

**Passo 6 — Migrations futuras.**
Sempre timestamp (`supabase migration new <nome>` → `YYYYMMDDHHMMSS_nome.sql`), append-only, rastreadas. Fim da numeração manual.

### O que permanece / é removido / consolidado

| Categoria | Destino |
|-----------|---------|
| **Permanece (ativo):** | `00000000000000_baseline_prod.sql` (único) |
| **Consolidado no baseline:** | as 12 rastreadas + toda a base 001–254 + órfãs 265/266 + historico_precos |
| **Arquivado (auditoria):** | os 198 arquivos legados → `migrations_archive/` |
| **Removido do caminho ativo:** | duplicatas/equivalentes/números reutilizados (deixam de existir como migrations ativas) |
| **Recriado:** | nada de schema; apenas o baseline representa o estado |

---

## 4. Guardas de CI (impedir recorrência) — Passo 7

Adicionar/atualizar em `.github/workflows` + `scripts/`:

1. **`migration-format-guard`** — toda migration em `migrations/` (exceto baseline) DEVE ser `^\d{14}_[a-z0-9_]+\.sql`. Rejeita prefixo numerado (`259_`) e nomes ad-hoc.
2. **`migration-unique-version-guard`** — nenhum par de arquivos compartilha o prefixo de versão (sem duplicatas/reuso de número).
3. **`migration-append-only-guard`** — migrations já commitadas (abaixo do HEAD) não podem ser modificadas nem reordenadas (diff contra `main`).
4. **`migration-drift-guard`** (o núcleo) — job de CI que: sobe Postgres shadow, roda `supabase db reset`, e compara o schema resultante com um **snapshot versionado** (`backend/supabase/schema.snapshot.sql`, gerado do baseline). Diff não-vazio = **fail**. Isto detecta drift, alterações fora de ordem e schemas divergentes automaticamente.
5. Atualizar `scripts/migration-sequence-guard.mjs` para o novo esquema (timestamp, não número).

---

## 5. Preservação de Produção — Garantias (Passo 4 do pedido)

- **Schema:** o baseline é *dump de prod* → idêntico por construção; provado no Passo 2 (diff vazio) **antes** de qualquer arquivamento.
- **Dados:** nenhuma operação toca tabelas de negócio. `db dump` é leitura; `db reset` só afeta shadow/local; o reparo de `schema_migrations` é metadata de tracking (backup antes).
- **Nada é destruído em prod.** Os 198 arquivos são **arquivados**, não deletados. As 12 linhas de `schema_migrations` têm backup antes do reparo.
- **Reversível:** se o diff do Passo 2 não for vazio, aborta-se sem tocar em nada.

---

## 6. Critérios de Sucesso → como o plano atende

| Critério | Como é atendido |
|----------|-----------------|
| ✅ Sem drift banco↔repo | `schema_migrations` = baseline = repo ativo |
| ✅ Sem duplicada/equivalente | todas colapsadas no baseline único |
| ✅ Prod reproduzível do repo | baseline É o dump de prod; provado por diff vazio |
| ✅ Histórico consistente/auditável | legado preservado em `migrations_archive/` + prova de equivalência do Passo 0 |
| ✅ CI impede recorrência | 5 guardas (formato, unicidade, append-only, drift, sequência) |

---

## 7. Restrições respeitadas
Sem novas features. Sem mudança de regra de negócio. Sem alterar RPC por refatoração. Sem alterar RLS. Sem tocar frontend. O baseline **captura** RPCs/RLS existentes tal como estão — não os modifica.

---

## Aprovação necessária
Este documento é o **plano**. Nenhuma alteração foi executada. Ao aprovar, executo **na ordem 0→7**, com o **Passo 2 (diff vazio) como gate obrigatório** antes de arquivar/reparar. Se o diff não for vazio, paro e reporto.
