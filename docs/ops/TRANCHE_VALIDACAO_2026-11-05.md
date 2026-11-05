# Validação da tranche de segurança — 2026-11-05

Escopo: `20261028100000`, `20261028110000`, `20261028120100`, `20261028121000`, `20261028122000`.
Ambiente: **contêiner Postgres 17 descartável** (`hub_seeded:snap`, estado pré-tranche), dados sintéticos. Produção não foi acessada para escrita. Só consultas somente leitura, usadas para comparar definições e ACLs.

## 1. Por que não usar a homologação existente

O projeto `jinlong-homolog-palm` (`yvdilcmxyjafnnsfdtam`) **não é um ambiente limpo**:

- já tem as cinco migrations aplicadas, e também `20261029155000`, `20261030100000`, `20261030120000`–`20261030140000` (que estão adiadas em produção);
- tem entradas de rollback e reaplicação no histórico (`rollback_s1b…`, `reaplica_…`);
- não foi confirmado que os dados são exclusivamente sintéticos;
- migrations foram aplicadas via MCP, então não há garantia de que o estado seja reproduzível.

Decisão: usar banco descartável. O homologação ficou apenas como referência, com comparação de definições (17 de 18 funções idênticas; a exceção `internal.token_gerente_fora_da_loja` corresponde a `20261030100000`).

## 2. Sequência validada

Aplicação por SQL, `ON_ERROR_STOP=1`, na ordem: `100000` → `110000` → `120100` → `121000` → `122000`. **Sem `101000`, sem `db push`, sem outras pendentes.** Resultado: aplicação sem erro.

## 3. Matriz de testes

Legenda: PASSOU / FALHOU / NÃO TESTADO. Para FALHOU, a causa indica se é da tranche.

| Área | Teste | Resultado | Observação |
|---|---|---|---|
| Tokens / isolamento | `sec-tokens-usuario-inativo.test.sql` | **PASSOU** (48 ok, 0 NOT OK) | Cobre B1–B4 (tenant), E2–E4 (vínculo), G1–G3 (auth.uid), H (produtos), I (ADMIN), J (provisionamento), K (caixas/gerencial) |
| Tokens / tenant SEC-04 | `sec04-token-gerente-tenant.test.sql` (fixture corrigida) | **PASSOU** (`SEC04 TOKEN GERENTE TENANT: OK`) | Correção: lojas sem `empresa_id` (trigger de multiempresa). Diff em `backend/scripts/sec04-token-gerente-tenant.test.sql` |
| Tokens | `tokens-autorizacao-operacao.test.sql` | NÃO TESTADO | Falha `no rows returned for \gset`: fixture espera gerente existente. **Falha idêntica no baseline sem a tranche** (pré-existente) |
| Tokens | `tokens-autorizacao-adversarial.test.sql` | NÃO TESTADO | Mesma causa (`\gset`) |
| Permissões / secdef | `c1-secdef-sem-identidade.test.sql` | FALHOU (ambiente) | ACL padrão local dá EXECUTE a anon/authenticated. **Falha também no baseline.** Produção (somente leitura): `pg_default_acl` de funções em `public` = `{postgres, service_role}`, sem anon/authenticated |
| Permissões / grants | `fase1-hardening-grants-residuais.test.sql` | FALHOU (ambiente) | `converter_venda_em_espera` e `devolver_venda_em_espera` com EXECUTE para anon no contêiner. **Falha no baseline.** Produção (somente leitura): anon = false, authenticated = true |
| Caixas / desembolso | `listar-caixas-elegiveis-desembolso.test.sql` | NÃO TESTADO | Fixture sem `empresa_id` (mesma classe do SEC-04). Não corrigido nesta etapa |
| Provisionamento | `provisionamento-wizard-trial.test.sql` | FALHOU (esperado) | Erro `PROVISIONAMENTO_AUTOMATICO_BLOQUEADO`, que é o comportamento novo da `121000`. **O teste é anterior à decisão e precisa ser atualizado** (ver §5) |
| Provisionamento | contingência (`J4`–`J7` de `sec-tokens-usuario-inativo`) | **PASSOU** | Contingência com responsável e trilha; anon/authenticated não executam |
| Tokens de dispositivo | `sec-token-dispositivo-vale-na-loja.test.sql` | NÃO TESTADO | Depende de `20261030100000` (adiada). Fixture também tem `usuario_vinculos_uniq` duplicado |
| Corte ADMIN | `corte-admin-pg-local/run.sh` | NÃO TESTADO | Harness exige cluster Postgres local com `PG_BIN`; não executado neste ambiente |
| Multiempresa | `multiempresa-fase1-isolamento.test.mjs` (PGlite) | **PASSOU** | |
| Multiempresa | `multiempresa-fase2-cobertura.test.mjs` (PGlite) | FALHOU (pré-existente) | Tabelas `comissoes_*` sem `tenant_guard` nem isenção. Não relacionado à tranche (nenhuma tabela `public` nova) |
| Sync offline | `sync-outbox-contract-smoke.mjs` | **PASSOU** | `Contract smoke OK (sync-outbox v1)` |
| Sync offline | `supabase/functions/sync-outbox/planGate.test.ts` (Deno) | **PASSOU** (4/4) | |
| Sync offline | `pagamentosParcelas.test.ts` (Deno) | **PASSOU** (4/4) | |
| Sync offline | fila real do PDV com token de dispositivo | NÃO TESTADO | Sem ambiente de PDV. Depende da `20261030100000` para o caminho de dispositivo |
| Rollback | cadeia completa 100000→122000 aplicada e revertida | **PASSOU** | Funções e ACLs idênticas ao baseline (md5 de `pg_get_functiondef`) |
| Rollback | `110000` com dados: ADMIN sintético | **PASSOU** | Após 110000: `ADMIN\|inativo`. Após rollback: `ADMIN\|ativo` |
| Rollback | `120100` efeitos sobre dados | NÃO TESTADO | Tokens revogados **não voltam** (limitação conhecida, documentada no runbook) |
| Backup / PITR | disponibilidade, retenção, restauração | NÃO TESTADO | Não há ferramenta de leitura de configuração de backup neste ambiente. Ver §6 |

Reprodução (no contêiner): aplicar as 5 migrations, executar `sec-tokens-usuario-inativo.test.sql` e `sec04-token-gerente-tenant.test.sql` com `psql -v ON_ERROR_STOP=0`, contar `RES|ok` e `NOT OK`.

## 4. Correções feitas nesta etapa

1. **Fixture do SEC-04:** criada empresa `f3000004-…-e1` e vinculadas lojas A e B. Sem alterar as asserções.
2. **Rollback de `20261028100000`:** criado (ausente antes).
3. **Rollback de `20261028110000`:** era stub. Agora restaura as funções e o token, com definições conferidas contra produção por md5.

## 5. Ajustes recomendados (não feitos)

- `provisionamento-wizard-trial.test.sql`: atualizar para esperar o bloqueio (`PROVISIONAMENTO_AUTOMATICO_BLOQUEADO`) ou usar o caminho de contingência. Hoje falha por decisão, não por defeito.
- Corrigir fixtures de `listar-caixas-elegiveis-desembolso` e `tokens-autorizacao-*` (mesma classe do SEC-04).
- Remover a duplicidade de vínculo em `sec-token-dispositivo-vale-na-loja`.

## 6. Backup e PITR (não verificados)

Não há ferramenta disponível aqui para ler a configuração de backup do projeto. **Verificação manual necessária:** no painel Supabase, projeto `jinlong` (`kbabmewnahysfvlybiak`), seção *Database → Backups*, conferir: se PITR está habilitado, a retenção em dias e o último backup. Não presumir que esteja habilitado.

## 7. Riscos remanescentes

- Revogação de tokens (120100) é irreversível por SQL.
- Desativação de ADMINs (110000): o rollback restaura, mas sessões podem ter sido encerradas no meio.
- A aplicação da 110000 sem a 101000 foi validada **somente em banco descartável**. A decisão de negócio é do dono.
- Sem teste no PDV real para o caminho de token de dispositivo.
- Três testes do repositório não executam por fixture ou por decisão (ver §3).
