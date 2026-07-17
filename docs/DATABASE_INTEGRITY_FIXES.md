# Database Integrity Hardening — Registro de Mudanças (FIXES)

Log cronológico de todas as mudanças efetivas aplicadas durante a sprint de hardening
(Fase 5.1), com evidência de validação. Documento vivo — atualizado por frente.

---

## Frente 1 — Drift `vendas.cliente_id`

**Mudanças de schema/código:** nenhuma. A frente foi de **investigação e reclassificação**
(ver `docs/DATABASE_INTEGRITY_DECISIONS.md` DEC-01). A migration `276_vendas_cliente_id_drift_fix.sql`
(já existente) permanece como reconciliação idempotente correta. Conclusão: o risco de "perda
silenciosa" é hipótese não comprovada, não incidente confirmado.

---

## Frente 2 — Policies fantasma

### FIX-2.1 — Versionamento de 19 RLS policies sobre tabelas vivas

**Arquivo criado:** `backend/supabase/migrations/277_rls_policies_fantasma_versionamento.sql`

**O que faz:** versiona 19 policies que existiam somente em produção (drift real, sem
`CREATE POLICY` em nenhuma migration), sobre tabelas vivas e já versionadas:

| Tabela | Policies versionadas |
|---|---|
| `clientes` | `clientes_loja_isolado`, `clientes_insert_loja`, `clientes_update_gerente_loja`, `clientes_delete_gerente_loja` |
| `contas_receber` | `contas_receber_loja_isolado` |
| `documentos_fiscais_pendentes` | `doc_fiscal_loja_isolado` |
| `liquidacoes_receber` | `liquidacoes_loja_isolado` |
| `itens_venda` | `itens_venda_select_loja`, `itens_venda_write_gerente_loja` |
| `ordens_compra` | `ordens_compra_gerente_loja` |
| `ordens_compra_itens` | `ordens_compra_itens_gerente_loja` |
| `pdv_config` | `pdv_config_select_gerencial`, `pdv_config_update_dono` |
| `produtos` | `caixa_policy`, `painel_policy` (vestigiais — ver DEC-03) |
| `tokens_desconto_gerente` | `tokens_desconto_select_gerente` |
| `transferencias_idempotencia` | `transferencias_idempotencia_select_gerente`, `_insert_gerente`, `_delete_gerente` |

**Fonte:** `pg_policies` do projeto de produção `jinlong` (`kbabmewnahysfvlybiak`), capturado em
2026-07-17. Predicados USING/WITH CHECK reproduzidos **verbatim**, roles e comandos idênticos aos
de produção. Idempotente (`DROP POLICY IF EXISTS` + `CREATE POLICY`).

**Não incluído:** 18 policies das 6 tabelas mortas (`perfis`, `funcionarios`, `funcionarios_meta`,
`comissoes_regras_funcionario`, `comissoes_regras_historico`, `historico_precos_produto`) — ver DEC-02.

**Validação (evidência):**
1. **Sintaxe/tipos contra schema real:** cada um dos 16 predicados distintos foi executado como
   `SELECT count(*) FROM public.<tabela> WHERE <predicado>` contra o banco de produção
   (read-only, zero escrita). Todos retornaram sem erro — colunas, tipos e funções
   (`auth.uid()`, `auth.jwt()`) válidos.
2. **Sequência de migrations:** `node scripts/migration-sequence-guard.mjs` → OK, nenhuma colisão
   (277 é o próximo número livre na faixa sequencial; 190 migrations numeradas).

**Impacto em bootstrap:** um `db reset` do zero agora recria essas 19 policies de RLS que antes
só existiam em produção, aproximando o estado do repositório do estado real do banco para as
tabelas vivas. Não altera comportamento em produção (recria idêntico).

**Ressalva de completude:** persiste divergência bidirecional em algumas tabelas vivas (o repo
cria policies que produção já dropou, ex.: `clientes_gerente`, `contas_receber_gerente`). A
paridade total repo↔produção só é comprovável rodando `supabase db diff` / branch efêmera contra
o banco real — registrado como item da Frente 7 (bootstrap determinístico).

---

---

## Frente 3 — RPCs legadas

### Auditoria da família de finalização de venda (evidência: pg_proc de produção, 2026-07-17)

| RPC (overload) | Caller real | Estado prod | Status | Decisão |
|---|---|---|---|---|
| `finalizar_venda_transacional_canonica_v4` (1 overload) | `caixaVendas.impl.ts` (7 usos) | vivo | **Ativa** (golden flow) | Manter — SSoT de finalização |
| `finalizar_venda_transacional` 9-arg | nenhum (só `.md`) | **vivo** (6 KB) | **Legada perigosa** | **Stub LEGACY_DISABLED** (FIX-3.1) |
| `finalizar_venda_transacional` 7-arg | nenhum | stub | **Legada** | Stub reafirmado (FIX-3.1) |
| `finalizar_venda_transacional_canonica_v3` (2 overloads) | nenhum (só `.md`) | stub | **Legada** | Já desativada — OK |
| `finalizar_venda_transacional_canonica_v2` (4 overloads) | nenhum | stub | **Legada** | Já desativada — OK |
| `finalizar_venda_com_fiscal` | nenhum (só `.md`) | **não existe** | **Morta** | Referência morta só em doc — nenhuma ação de schema |
| `registrar_venda_com_itens` | `sync-outbox` (PDV local) | vivo | **Ativa** (canal offline) | Manter — caller único via guard |

**Demais RPCs chamadas pelo código (63 distintas):** auditadas por cruzamento
`grep rpc('…')` × `pg_proc`. Todas as chamadas pelo código resolvem para uma função existente
(nenhuma RPC ausente). Nenhuma outra família com overload legado vivo foi encontrada além da
finalização — `cancelar_venda_transacional` (1 overload), `devolver_ou_trocar_venda` (1 overload)
e `decrementar_estoque_seguro` (1 overload, com `decrementar_estoque_idempotente` delegando a ela,
documentado). `shadow_validar_venda_engine_v4` existe em prod sem caller de código: função de
sombra/validação (não é caminho de escrita), fora do escopo de desativação.

### FIX-3.1 — Stub da RPC legada `finalizar_venda_transacional`

**Arquivo criado:** `backend/supabase/migrations/278_stub_finalizar_venda_transacional_legada.sql`

**O que faz:** `CREATE OR REPLACE` dos 2 overloads (7-arg e 9-arg) de
`public.finalizar_venda_transacional` com corpo `RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'`
(mantém assinatura e `RETURNS void`), + `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
Fecha um caminho de finalização paralelo à v4 que estava vivo e executável por `authenticated`
em produção. Ver DEC-05.

**Validação (evidência):**
1. **Nomes de parâmetro conferem com produção** (`pg_get_function_identity_arguments`) e com o repo
   (020/122) → `CREATE OR REPLACE` válido (Postgres proíbe renomear parâmetros; aqui não há renome).
2. **`RETURNS void` conferido** em ambos overloads via `pg_get_function_result` → replace sem
   erro 42P13.
3. **0 callers** confirmado por grep em todo o código (só 2 refs em `.md`).
4. `node scripts/migration-sequence-guard.mjs` → OK. `node scripts/rpc-gate-guard.mjs` → OK
   (invariante de caller único de venda preservado: v4 web | registrar_venda_com_itens offline).

**Impacto em bootstrap:** um `db reset` do zero passa a produzir a função-base já desativada,
alinhado ao estado seguro (e ao estado que produção deve assumir quando a migration for aplicada).

---

## Pendentes (frentes futuras)

- Frente 4 (Views), Frente 5 (Grants), Frente 6 (Índices),
  Frente 7 (Bootstrap determinístico), Frente 8 (CI) — ainda não iniciadas.
