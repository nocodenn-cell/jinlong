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

## Pendentes (frentes futuras)

- Frente 3 (RPCs legadas), Frente 4 (Views), Frente 5 (Grants), Frente 6 (Índices),
  Frente 7 (Bootstrap determinístico), Frente 8 (CI) — ainda não iniciadas.
