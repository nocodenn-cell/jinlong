# STG-01 — Reavaliação técnica das migrations (pausa)

**Data:** 2026-10-10  
**Projeto permitido:** `jinlong-staging` (ref Free de homologação — ver allowlist local/`CAPACITY_ALLOWED_PROJECT_REF`)  
**Proibido:** produção `jinlong`, `ageguard`, reset/delete do staging  
**Status:** operação MCP fragmentada **parada**; **nenhuma migration nova** até autorização explícita

---

## 1. Operação atual

| Item | Estado |
|------|--------|
| Flag `tmp/stg-migrate/STOP` | Presente (`NO_NEW_MIGRATIONS`) |
| Processos migrate / tmux | Nenhum |
| Novas `apply_migration` | Não iniciadas nesta reavaliação |
| Projetos | staging `ACTIVE_HEALTHY`; prod e ageguard **intocados** |

---

## 2. Números (histórico × disco)

| Métrica | Valor |
|---------|------:|
| Arquivos em `backend/supabase/migrations/*.sql` | **406** |
| Linhas em `supabase_migrations.schema_migrations` | **339** (confirmado) |
| Match exato nome↔arquivo | **291** |
| Nomes órfãos no histórico (sem arquivo 1:1) | **48** (splits/`batch_`/`chunk_`/`_p1`/`_ddl`/…) |
| Entradas sintéticas (heurística) | **~17** |
| Arquivos de disco **sem** registro claro no histórico | **~76** |
| Destes, cauda `20261005+` (fila local `pending_now`) | **17** |
| Destes, lacunas mid-chain (jun–ago) | **~59** |
| Falhas registradas em `apply_progress.json` → `failed` | **[]** (vazio) |

Lista canônica da pausa: artefato  
`/opt/cursor/artifacts/stg-reassessment-still-remaining.txt` (76 stems).

### 2.1 Cauda explícita ainda não registrada (17)

Ordem de disco preservada:

1. `20261005004647_financeiro_loja_contas_ledger`
2. `20261005091218_financeiro_hardening_final`
3. `20261005173427_entrada_manual_fornecedor_sem_cnpj`
4. `20261005224553_estoque_ajuste_concorrente`
5. `20261005225856_entrada_documento_posterior`
6. `20261006120000_financeiro_contas_formas_e_painel`
7. `20261006180000_financeiro_contas_operacionais`
8. `20261006190000_desconto_comercial_operador_dinheiro`
9. `20261007161220_fiscal_cancelado_ssot`
10. `20261007163000_ssot_001_002_painel_ec_cache`
11. `20261007163100_ssot_003_nfe_obrigacao_duplicata`
12. `20261007170000_ssot_002_mov_ar_ec_cache`
13. `20261007171000_ssot_002_cancel_guard_antes_devolucao`
14. `20261007180000_calcular_valor_sistema_por_forma_caixa`
15. `20261007190000_caixas_fechamento_formas_snapshot`
16. `20261009180000_protege_preco_custo_operador`
17. `20261009220000_fiscal_rpc_isola_loja`

### 2.2 “Falhas”

Não há registros de failure no ledger local (`failed: []`).  
O que existe é **incompleto / inconsistente**, não um log de SQL error persistido:

- applies via MCP com **nomes sintéticos** (histórico ≠ nome do arquivo Git);
- **ordem de aplicação** = timestamp de apply (`version` ~ `20261009…`), **não** a versão embutida no filename;
- alguns DDL aplicados via `execute_sql` **sem** linha correspondente em `schema_migrations`.

---

## 3. Histórico vs schema real

### 3.1 O que parece utilizável

- `finalizar_venda_transacional_canonica_v4` (+ `…_unscoped`) presente
- Núcleo PDV: `lojas`, `produtos`, `vendas`, `estoque`, `formas_pagamento`, `funcionarios`
- Satellite fiscal: `documentos_fiscais_pendentes`, `_eventos`, `_dlq` + RPCs `fiscal_*`
- ~95 tabelas / ~151 funções em `public`

### 3.2 Inconsistências / aplicações parciais

| Achado | Evidência | Risco |
|--------|-----------|-------|
| **Financeiro parcial sem histórico** | `contas_financeiras` / `movimentos_financeiros` / `financeiro_comandos` existem; `hist_financeiro_ledger = false` | Reaplicar `20261005004647_*` pode falhar em `CREATE TABLE` já existente |
| **Lacunas mid-chain** | Ex.: `promocoes` ausente; `relatorio_curva_abc` ausente; colunas fiscais em `lojas`/`produtos` não detectadas no probe | Capacidade/fiscal/promo incompletos vs Git |
| **Objetos mid-chain presentes sem nome exato** | `system_alerts`, `vinculos_fornecedor_produto`, `status_publicacao`, `vendas.cliente_id` | Cobertura por batch/órfão — histórico não prova arquivo Git |
| **`documentos_fiscais` (tabela base)** | Ausente; migrations usam `documentos_fiscais_pendentes` | **Não** é bug de apply — naming do produto |
| **Versões no histórico** | `version` = instante MCP, `name` = label; última: `20261010000342` / `20261001100400_c3_devolver_retry_autorizacao` | `supabase db push` **não** consegue reconciliar 1:1 com filenames |

**Conclusão:** o histórico **não** é SSoT fiel do esquema Git. Há schema “quase útil” para PDV core, com buracos mid-chain e cauda Oct/2026 pendente.

---

## 4. Caminho CLI / Postgres direto (sem hex/Base64/scratch)

### 4.1 Disponibilidade neste ambiente

| Recurso | Estado |
|---------|--------|
| `npx supabase` (CLI ~2.120) | Disponível |
| `SUPABASE_ACCESS_TOKEN` | **Ausente** |
| `DATABASE_URL` / senha DB staging | **Ausente** |
| `psql` | Não instalado (instalável se houver URL) |
| Script guardado | `pdv-importados/scripts/staging/apply-migrations-staging.sh` → `db push --project-ref` (exige `CAPACITY_CONFIRM_DB_PUSH=yes`) |

### 4.2 Por que `db push` na cara não fecha sozinho

O CLI identifica migrations pelo **prefixo de versão do filename**.  
No staging, as linhas em `schema_migrations` usam versões **sintéticas de apply**. Resultado provável sem reparo: o CLI trata o Git como “não aplicado” e tenta reexecutar DDL já existente → erros em massa.  
**Não resetar** o projeto para “alinhar”.

### 4.3 Plano simples recomendado (após autorização)

**Pré-requisito (humano):** uma destas credenciais, só para o projeto staging Free (`CAPACITY_ALLOWED_PROJECT_REF`):

1. `SUPABASE_ACCESS_TOKEN` (PAT) com acesso ao projeto staging, **ou**
2. Database URL / senha do DB staging (Settings → Database)

**Passos (ordem e dependências preservadas):**

1. **Inventário fechado** (já feito nesta pausa): lista dos ~76 stems + probes de objetos.
2. **Reparar histórico (não o schema)** — script idempotente, só em staging:
   - Para cada arquivo Git cujo efeito já está no schema (match por nome/`batch_`/probe), inserir/atualizar `supabase_migrations.schema_migrations` com `version` = prefixo do filename e `name` = stem canônico.
   - Não apagar linhas; preferir **upsert canônico** + documentar órfãos.
3. **Aplicar só o restante** em ordem lexicográfica do disco:
   - Preferido: `psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f <file.sql>` um a um; em sucesso, `INSERT` da versão canônica.
   - Alternativa: após reparo, `npx supabase db push --project-ref "$CAPACITY_ALLOWED_PROJECT_REF"` (com guards do script staging).
4. **Cauda financeira:** se DDL parcial já existir, usar SQL **idempotente** (`IF NOT EXISTS` / skip register-only) em vez de reexecutar o arquivo bruto às cegas.
5. **Validação** (critérios abaixo) → só então seed/k6.

Sem hex, sem Base64, sem scratch packs MCP.

---

## 5. Estimativa de esforço (técnico, não calendário)

| Etapa | Escopo | Esforço relativo |
|-------|--------|------------------|
| Credencial + link CLI/`psql` | setup | minutos após o segredo |
| Reparo de histórico | ~339 linhas → canônicas | script único; validação por contagem |
| Apply mid-gap (~59) | ~400 KiB SQL | depende de conflitos parciais; maioria deve ser `IF NOT EXISTS`/CREATE OR REPLACE |
| Apply cauda (17) | financeiro + ssot + proteção custo | maior risco de colisão parcial |
| Validação schema | probes + smoke RPC | curto |

Ordem de grandeza total **após credencial:** dezenas de minutos se o reparo estiver correto; **horas** se mid-gap exigir resolução manual de colisões — ainda assim **ordens de magnitude** mais simples que MCP arquivo-a-arquivo.

---

## 6. Critérios de validação (gate antes de seed/k6)

1. `count(*)` em `schema_migrations` ≥ 406 **ou** igual ao número de arquivos Git após normalização (sem órfãos sintéticos pendentes).
2. Todo stem em `stg-reassessment-still-remaining.txt` ou aplicado ou justificado (skip documentado).
3. Probes obrigatórios:
   - `to_regclass('public.contas_financeiras')` e histórico `…financeiro_loja_contas_ledger`
   - `finalizar_venda_transacional_canonica_v4` com args atuais
   - `documentos_fiscais_pendentes` + `fiscal_enfileirar_documento_venda`
   - ausência de erro em `SELECT` nas views críticas (`v_kardex_unificado`, etc.)
4. Guards: `assert-staging-target` + denylist prod antes de qualquer write.
5. Produção / ageguard: zero DDL (re-checar `list_projects` status only).

---

## 7. Decisão pedida (gate humano)

**Aguardando autorização explícita** para retomar. Opções sugeridas:

- **A)** Autorizar reparo de histórico + apply via `psql`/`db push` **somente** no staging Free, fornecendo PAT ou DB URL staging.
- **B)** Autorizar só o reparo de histórico (sem DDL novo) para inspeção.
- **C)** Manter pausa.

Não reiniciar do zero. Não reset. Não excluir staging.

---

**Atualização Option B (2026-10-10):** análise/prep sem escrita remota em `STG01_OPTION_B_REPAIR_PREP.md` + `docs/capacity/staging/repair-prep/`.

**Comparação A vs B (2026-10-10):** recomendação **B** (baseline local) em `STG01_ESTRATEGIA_A_VS_B.md` — sem INSERTs remotos.
