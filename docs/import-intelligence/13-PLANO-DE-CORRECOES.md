# Plano — resolver os problemas encontrados (Import Intelligence + Multiempresa)

## Context

As sprints 0, 1A, 2A e M1 (branch `claude/import-intelligence-s1a`, até `69e61316`) entregaram o motor de landed cost e a fundação multiempresa testada em PostgreSQL local. Os GO/NO-GO ficaram negativos por problemas concretos. Este plano resolve esses problemas em ordem de dependência para chegar a: (1) habilitar o Import Intelligence só para o cliente contratante, (2) iniciar a persistência das importações, (3) sem regressão no ERP/PDV.

Regras que valem para todas as fases: migrations aditivas, testadas no banco local (`jl-import-s2a-pg`, baseline `jl_replay`), rollback testado até igualdade de schema, regressão dos 43 scripts `backend/scripts/*.test.sql` idêntica ao baseline (31 PASS / 12 FAIL pré-existentes), nada em produção sem autorização explícita.

## Problemas, severidade e fase

| # | Problema | Sev. | Fase |
|---|---|---|---|
| P1 | Sem sincronização `usuarios` → `usuario_vinculos` (ESPEC etapa 4) | P0 | 1 |
| P2 | Lojas criadas sem `empresa_id` (`ensureLoja`, configurações) | P0 | 1 |
| P3 | **Novo:** policy `lojas_write_gerente` permite a qualquer GERENTE/DONO/ADMIN escrever em qualquer loja (`20260621002000_224…sql:468-471`) | P0 | 1 |
| P4 | RLS testada só com `auth` simulado | P1 | 1 |
| P5 | Sem fluxo/runbook de habilitação comercial do módulo; D9 pendente | P1 | 1 |
| P6 | Custo unitário em `numeric(10,2)`: erro de até 100% em itens baratos (D-02/A-06) | P0 | 2 |
| P7 | Parser perde zeros em `cProd`/`cEAN` (A-03) + compatibilidade de vínculos (R-P1) | P0 | 3 |
| P8 | Duplicatas × valor da NF-e não conciliados (A-02); NF-e sem vínculo duplica estoque de OC (A-05) | P0 | 3 |
| P9 | XML da NF-e não persistido (A-04) | P0 | 3 |
| P10 | Divisão `/` do PostgreSQL arredonda duas vezes (D-01) | P1 | 4 (regra) |
| P11 | Persistência do Import Intelligence | — | 4 |
| P12 | P2s: RPC legada (A-13), cascata AP (A-14), regra ×1,5 (A-10), margem com custo atual (A-18), `preco_custo_medio` órfão (A-07), rótulo (A-12) | P2 | 5 |

## Fase 0 — Decisões humanas (pré-requisitos, não código)

| Decisão | Bloqueia | Recomendação |
|---|---|---|
| Quem pode criar loja (hoje: qualquer GERENTE via configurações) | P3 | Só DONO da empresa e provisionamento |
| D9: quem é administrador de plataforma | P5 | Nenhuma conta legada; criar só quando houver operador nomeado |
| Dono da autorização comercial do módulo | P5 | Registro com nº de contrato no `autorizado_por` |
| Escala de persistência do custo (DECISÃO-06): unitário 6 casas | P6 | `numeric(14,6)` |
| Entrada manual de custo na UI: quantas casas | P6 | Até 6 |
| R-P1: migração de vínculos `cProd` com Compras | P7 | Relatório antes do merge |
| DECISÃO-05 (tolerância) e DECISÃO-13 (OC × NF-e) | P8 | Tolerância zero; bloquear NF-e sem vínculo com OC recebida |
| DOC-01..05 (retenção de XML) | P9 | Jurídico |
| Clone autorizado de produção | P4, P6 (tempo de lock) | Opcional após Fase 1.4 |

## Fase 1 — Fechar o isolamento multiempresa

**1.1 Sincronização `usuarios` → `usuario_vinculos` (P1).** Fatos: só `admin/funcionarios/actions.ts` (criar :156, atualizar perfil :230, ativo :325) e `admin/provisionamento/actions.ts` (`ensureDono` :181/:195/:227) escrevem `perfil/loja_id/ativo`; não há trigger em `usuarios`.
- Migration nova: coluna `usuario_vinculos.origem` (`LEGADO` | `DIRETO`, default `DIRETO`; backfill marca `LEGADO`).
- Extrair a derivação já existente em `m1_backfill_empresa_legada()` (`20261010120100…sql`) para `m1_sincronizar_vinculo_usuario(p_usuario uuid)`; o backfill passa a chamá-la em loop.
- Trigger `AFTER INSERT OR UPDATE OF perfil, loja_id, ativo ON usuarios` chama a função. Regras: só toca vínculos `origem = LEGADO`; nunca apaga (desativa); mudança de papel/loja desativa o vínculo anterior e cria o novo; `ativo=false` desativa todos os `LEGADO`.
- Vínculos `DIRETO` (multi-loja da M1) nunca são alterados pelo trigger.
- Testes: cada cenário das duas actions reproduzido em SQL → `fp_divergencias_vinculos_legados()` = 0.

**1.2 `empresa_id` em toda loja nova (P2).**
- Trigger `BEFORE INSERT ON lojas`: se `empresa_id` nulo e há `auth.uid()`, herda a empresa da loja do criador; sem identidade (service_role) e sem `empresa_id` → erro.
- `ensureLoja` passa `empresa_id` explícito; provisionamento ganha `ensureEmpresa` (sem CNPJ fictício; `origem = CADASTRO`).
- Depois: tratar lojas nulas existentes (exceções do backfill) por decisão operacional; só então migration separada `ALTER COLUMN empresa_id SET NOT NULL`, com teste que prova zero nulos.

**1.3 Fechar escrita cross-tenant em `lojas` (P3).** Substituir `lojas_write_gerente` por policies: UPDATE com `fp_pode_loja(id, ARRAY['GERENTE','DONO'])`; INSERT com `fp_eh_dono_da_empresa(empresa_id)`. Teste de equivalência para o cliente atual (DONO e GERENTE da própria loja continuam editando) e teste de negação A×B. Mudança de comportamento só no ponto decidido na Fase 0.

**1.4 RLS com `auth` real (P4).** Usar a stack local do Supabase (`supabase start`, CLI 2.117 e Docker já disponíveis; config em `backend/supabase/config.toml`), que traz GoTrue e PostgREST reais. Rodar: `m1-multiempresa.test.sql`, `test-rls-scope.mjs`, `p0-rls-rest-smoke.mjs` e um smoke REST novo (usuário A chamando RPC/tabela de B via PostgREST). Substitui o stub para validação de RLS.

**1.5 Habilitação e gate no servidor (P5).** Runbook em `docs/import-intelligence/` para `ops_definir_modulo_empresa` (quem, como, registro). Helper de servidor `requireModulo('IMPORT_INTELLIGENCE')` em `pdv-importados/lib/` (chama RPC `fp_pode_modulo`; nega por padrão), pronto antes de qualquer rota do módulo. Teste: usuário sem módulo recebe negação na action/rota.

## Fase 2 — Precisão de custo (P6)

Uma migration, em ordem:
1. `DROP VIEW produtos_custos` e `DROP TRIGGER trg_produtos_margem_bu` (bloqueiam `ALTER TYPE`; `20261009180000…sql:50`, `126_…sql:27`).
2. `ALTER COLUMN … TYPE numeric(14,6)`: `produtos.preco_custo`, `produtos.preco_custo_medio`, `importacoes_nfe_itens.custo_unitario`, `itens_venda.custo_unitario_snap`.
3. Recriar a view (com o REVOKE/GRANT de `:70-71`) e o trigger com o mesmo `WHEN`.
4. `CREATE OR REPLACE` de `trg_fn_regras_preco_margem` e `trg_fn_precos_atacado_margem` trocando `v_custo numeric(10,2)` por `numeric` (`124_…sql:49,115`).
5. `importar_nfe_transacao`: tirar `ROUND(v_custo_unit, 2)` de `preco_custo` e `custo_unitario` (`20261005173427…sql:169,230`); `preco_varejo` continua com 2 casas.

Cuidados: o bloco de `20260816135000…sql:65-70` força `preco_custo_medio` de volta a 10,2 em replay — documentar que roda antes e não reverte a nova migration (verificar no replay). Mudar escala reescreve a tabela: medir tempo de lock de `itens_venda` em clone antes de produção. Relatórios mantêm saída monetária em 2 casas (`::numeric(14,2)`), correto.

TypeScript: campo de custo aceita até 6 casas (opção nova em `useMoneyInput`/`filterBRLChars`, só para custo); exibição de custo unitário com até 6 casas em `ImportarNfePageClient.tsx:628,706,1092` e `PrecosSection.tsx`. Preços de venda inalterados.

Testes: T-RND-03 estendido às colunas; caso `0,005` gravado sem perda; BR-03 (`20260806004637…sql:492`) continua passando; regressão 43 scripts; vitest de produtos/importar-nfe; typecheck.

## Fase 3 — Entradas de NF-e

- **3.1 Parser (P7)**, PR separado (S1b): `nfeParser.ts` preserva `cProd`, `cEAN`, `cEANTrib`, `NCM`, `CNPJ`, `nNF` como texto; lê `vUnCom`/`qCom` como string; lê `ICMSTot` e `det/imposto` só para leitura. Antes do merge: relatório R-P1 dos vínculos `vinculos_fornecedor_produto_depara` afetados e migração com script de volta.
- **3.2 Guardas (P8)** em `confirmar_importacao_nfe` (`ssot_003`): G-A02 (`Σ duplicatas` vs valor econômico, tolerância DECISÃO-05) e G-A05 (bloquear NF-e sem vínculo quando a OC já tem saldo recebido nos mesmos produtos), atrás de flag; teste de equivalência com flag desligada.
- **3.3 XML (P9)**, após DOC-01..05: coluna/tabela com `sha256`, bucket privado por tenant, sem exclusão automática.
- **3.4** Rótulo `ENTRADA_REMessa_LOJA` em `vendaLabels.ts:76` (A-12).

## Fase 4 — Persistência do Import Intelligence (P11)

Só depois das Fases 1 e 2. Tabelas da proposta (`import_processo`, `import_documento`, `import_despesa`, `import_rateio_memoria`, `tributo_*`, `custo_versao`, `custo_item`) com `empresa_id NOT NULL` + `loja_id`, RLS por `fp_pode_loja` **e** `fp_pode_modulo`, escrita só por RPC `import_*`. Adapter em `pdv-importados/lib/import/` chama `calcularLandedCost` (`shared-core/src/import`), calcula `sha256` sobre `serializarCanonico`, e recalcula `verificarAprovacao` no servidor antes de aprovar. Regra D-01: qualquer SQL de arredondamento usa `div`/`mod` (padrão validado em `pg.local.spec.ts`).

## Fase 5 — Limpeza P2

A-13 revogar `confirmar_remessa_entrada(uuid)` após verificar chamadores em produção; A-14 trocar `ON DELETE CASCADE` de `contas_pagar.nfe_importacao_id`; A-10 remover regra ×1,5 (DECISÃO-09); A-18 sinalizar fallback de margem; A-07 decidir `preco_custo_medio`; triagem das 12 falhas pré-existentes da regressão (separar ambiente × bug real).

## Sequência e dependências

Fase 0 → 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → (habilitar módulo por cliente). Fase 2 em paralelo com Fase 1 (arquivos diferentes). Fase 3.1 independente. Fase 4 exige 1 + 2. Fase 5 a qualquer momento.

## Verificação (cada fase)

1. Aplicar migrations em cópia de `jl_replay` (ou na stack Supabase local a partir da 1.4).
2. `psql -v ON_ERROR_STOP=1 -f backend/scripts/m1-multiempresa.test.sql` + teste novo da fase.
3. Regressão: `regressao.sh` antes/depois → status idêntico aos 43 scripts.
4. `c1-secdef-sem-identidade.test.sql` verde.
5. Rollback → `pg_dump --schema-only` idêntico ao estado anterior.
6. Guardrails: `migration-sequence-guard`, `rpc-gate-guard`, `core-rule-guard`, `domain-boundary-guard`.
7. TS: `tsc --noEmit` e `vitest run` em `shared-core` e `pdv-importados` quando houver TS.

## Critérios para os GO

- **Habilitar módulo por cliente:** Fases 1.1–1.5 verdes, RLS validada com `auth` real, decisão comercial registrada.
- **Persistência do Import Intelligence:** acima + Fase 2 verde + `lojas.empresa_id NOT NULL`.
