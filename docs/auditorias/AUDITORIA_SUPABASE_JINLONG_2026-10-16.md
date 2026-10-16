# Auditoria Supabase — Jinlong (2026-10-16)

Produção `kbabmewnahysfvlybiak` (somente leitura) · Homologação `yvdilcmxyjafnnsfdtam` (jinlong-homolog-palm).
Nenhuma alteração foi feita em produção. Toda simulação de perfil em produção rodou em `BEGIN READ ONLY`.

## 1. Resumo

| # | Achado | Sev. | Status em produção | Tratamento |
|---|--------|------|--------------------|-----------|
| A | RPCs fiscais com guarda morta (`current_user <> 'postgres'` dentro de SECURITY DEFINER): qualquer autenticado (inclusive OPERADOR) reprocessa/enfileira documentos fiscais | **P0** | **ABERTO** — migration `20261009220000_fiscal_rpc_isola_loja` está no repo e em homologação, **não em produção** | Requer aprovação para aplicar (seção 5) |
| B | `fiscal_cancelar_documento` / `fiscal_marcar_cancelado` gravam `fiscal_error_category='CANCELAMENTO'`, recusado pelo CHECK → todo cancelamento fiscal falha com 23514 | P1 | Ainda não exposto em prod (função chega com A) | **Corrigido**: `20261016120000` (homologação aplicada + teste) |
| C | `produtos_custos` (vazamento de custo ao OPERADOR) | P0 (histórico) | **Corrigido e validado** | Nada a fazer; ERROR do Advisor é aceito por design |
| D | `sync_request_nonces` com RLS desligada em produção (drift: a 024 liga) e `venda_engine_shadow_runs` (só existe em prod) sem RLS | P2 | Sem exposição hoje (sem grant a anon/authenticated) | **Corrigido**: `20261016120100` |
| E | 8 funções com `search_path` mutável (Advisor 0011) | P3 | Todas INVOKER, sem EXECUTE para clientes (exceto 1 trigger) | **Corrigido**: `20261016120100` |
| F | 9 migrations do repo ausentes em produção (drift) | P1 | Ver seção 4 | Requer aprovação |
| G | `gtin_lookup_cache`: INSERT/UPDATE `true` para qualquer autenticado (envenenamento do cache de GTIN) | P2 | Aberto | Pendência (seção 6) |
| H | Estoque × kardex: 105/152 linhas de `estoque` sem movimento no ledger; 31 vendas CONCLUIDA sem movimento (25 de abr/2026, 6 até 08/08/2026) | P2 (dado histórico) | Nenhuma ocorrência após 08/08/2026 | Não alterado (regra: não mexer em dado real) |

Critério de conclusão: o único P0 aberto (A) **já tem correção versionada, testada e aplicada em homologação**; o
bloqueio é exclusivamente a aprovação para produção. Não há P0 sem tratamento no repositório.

## 2. Evidências

### A — RPCs fiscais (P0, produção)
Catálogo de produção (`pg_proc`): `fiscal_reprocessar_documento` contém `IF current_user <> 'postgres' THEN <checa perfil>`,
`fiscal_enfileirar_documento_venda` e `fiscal_registrar_evento_enqueue_erro` idem; todas `SECURITY DEFINER`, dono `postgres`,
`EXECUTE` para `authenticated`. Dentro de SECURITY DEFINER `current_user` = dono → a checagem nunca roda.
Reprodução executável: `npm run test:fiscal-rpc-authz -w fastproduct-backend` (PGlite, sessão `authenticator` + `SET ROLE
authenticated`) imprime "ANTES: OPERADOR da loja A reprocessou documento ERRO da loja B e esvaziou a DLQ" com os corpos
históricos que produção ainda roda, e "DEPOIS: ... negados" com a migration aplicada.
Hoje há 1 loja em produção: o impacto imediato é escalonamento OPERADOR → ação gerencial fiscal (reprocessar DLQ /
enfileirar NFC-e), não vazamento entre lojas. Vira cross-tenant na 2ª loja.

> Limitação: o `execute_sql` do MCP roda com `session_user = postgres`, que a guarda corrigida trata (corretamente) como
> sessão privilegiada. Por isso a prova de negação ao OPERADOR é feita no PGlite com `authenticator`, não via MCP.

### B — CHECK de categoria fiscal (P1)
Homologação, transação abortada (nada persistido): GERENTE ativo da própria loja → `fiscal_cancelar_documento(doc PENDENTE)`
→ `ERROR 23514 ... violates check constraint "documentos_fiscais_pendentes_error_category_check"`.
Após `20261016120000` em homologação: mesmo cenário → `status=CANCELADO, fiscal_error_category=CANCELAMENTO,
transicao_origem=PENDENTE>CANCELADO` (transação aberta descartada; homologação conferida limpa depois: 0 docs, 0 usuários de teste).
O teste PGlite existente não pegava porque a tabela-stub não tem o CHECK; o novo teste usa o CHECK real da 065.

### C — `produtos_custos` (verificado em produção)
Definição vigente = repo (`security_invoker=off`, junção com `usuarios` por perfil ativo + loja). ACL: `authenticated=r`, sem anon.
Simulação por perfil (`SET LOCAL ROLE authenticated` + `request.jwt.claims`, `BEGIN READ ONLY`):

| Perfil | Linhas na view | Produtos visíveis | SELECT em `produtos.preco_custo` |
|--------|---------------:|------------------:|------------------|
| OPERADOR ativo | **0** | 155 | **negado** (`has_column_privilege=false`) |
| GERENTE ativo | 155 | 155 | via view |
| GERENTE inativo | **0** | — | — |
| anon | sem privilégio | — | negado |

Grants de coluna: nenhum `SELECT` em `preco_custo`/`preco_custo_medio` para anon/authenticated. Escalonamento via
`usuarios`: UPDATE de coluna só em `idioma_preferido` → não é possível virar GERENTE/ADMIN.
O ERROR `security_definer_view` do Advisor permanece **por design**: a view é o único caminho de custo para perfis
gerenciais porque a coluna está revogada. Removê-lo exigiria dar `USAGE` em `internal` ao `authenticated` (amplia
superfície) — não vale a troca.

### Demais verificações sem achado
- RLS: 85/87 tabelas com RLS; as 2 sem RLS são o achado D. Nenhuma policy `USING true` em tabela com `loja_id`.
- SECURITY DEFINER expostas: todas as 70 checam `auth.uid()`/helpers, exceto leituras de config e `marcar_comissoes_pagas`,
  que delega a `liquidar_comissoes` (checa `auth.uid()`). Padrão `COALESCE(auth.uid(), p_operador_id)` só usa o parâmetro sem JWT
  (service_role) — seguro.
- Storage: `produto-imagens` isola por loja via RLS de `produtos` na subquery; `documentos-fiscais-xml` privado.
- Edge: `sync-outbox` (HMAC + anti-replay ativo nos logs), `fiscal-worker` (401 próprio), `validar-gerente` (verify_jwt).
- Integridade financeira: 0 caixas fechados sem dados, 0 operadores com 2 caixas abertos, 0 estoque negativo/duplicado,
  0 `idempotency_key` de venda duplicada, 0 venda sem caixa. Divergências de pagamento analisadas: fiado com entrada +
  liquidação (consistente) e desconto de atacado (bruto usa preço original) — não são bugs.
- Logs 24h: nenhum ERROR/FATAL no Postgres; "Thread killed by timeout manager" do PostgREST = encerramento de conexão ociosa.
- Performance: maior tabela tem 744 kB / 146 linhas. Sem evidência de gargalo → nenhuma otimização feita (regra: só com evidência).

## 3. Migrations criadas (este PR)

| Versão | Arquivo | Natureza | Rollback |
|--------|---------|----------|----------|
| 20261016120000 | `fiscal_error_category_cancelamento.sql` | Amplia CHECK (+`CANCELAMENTO`) | No cabeçalho |
| 20261016120100 | `hardening_rls_search_path_residual.sql` | RLS deny-by-default em 2 tabelas internas + `search_path=''` em 8 funções; tolera objeto ausente | No cabeçalho |

Ambas aplicadas em homologação com a versão do arquivo em `schema_migrations` (sem drift Local≠Remote).

## 4. Drift produção × repositório

Ausentes em produção (presentes no repo e em homologação):
`20261006120000 financeiro_contas_formas_e_painel`, `20261007161220 fiscal_cancelado_ssot`, `20261007163000 ssot_001_002`,
`20261007163100 ssot_003`, `20261007163200 ssot_004_revoke_insert_documentos_fiscais`, `20261007170000 ssot_002_mov_ar`,
`20261007171000 ssot_002_cancel_guard`, `20261007180000 calcular_valor_sistema_por_forma_caixa`,
`20261007190000 caixas_fechamento_formas_snapshot`, `20261009220000 fiscal_rpc_isola_loja` (**P0**),
`20261010120000 caixa_sem_loja_padrao` (cabeçalho: "Não aplicar em produção nesta sprint").
Extras só em produção: tabela `venda_engine_shadow_runs`; RLS desligada em `sync_request_nonces`.
Extras só em homologação: views SECURITY DEFINER `v_vendas_dia`, `v_top_produtos`, `v_venda_consistencia_anomalias`.

O código do app em `main` já chama `fiscal_cancelar_documento` (`pdv-importados/app/gerente/financeiro/actions.ts:168`), que não
existe em produção — se o build implantado contém essa action, ela falha hoje com "função inexistente" (não verificado no deploy).

## 5. Pendências que exigem aprovação

1. **[P0] Aplicar em produção, nesta ordem**: `20261016120000` (CHECK) → `20261009220000` (isolamento fiscal).
   A ordem importa: sem o CHECK, o `fiscal_cancelar_documento` que a 20261009220000 cria nasce quebrado.
   A 20261009220000 tem bloco `DO $verify$` que aborta se a guarda morta sobreviver. Pós-check sugerido:
   `select proname from pg_proc where pronamespace='public'::regnamespace and proname like 'fiscal_%' and prosrc ~ 'current_user\s*<>\s*''postgres''' and has_function_privilege('authenticated', oid, 'EXECUTE');` → 0 linhas.
2. Decidir o restante do drift (seção 4) — `20261007161220`/`ssot_*` mudam regra de negócio fiscal/caixa e precisam de janela.
3. `20261016120100` (hardening) — baixo risco, sem pressa.
4. Ativar *Leaked Password Protection* no Auth (painel Supabase; Advisor WARN).

## 6. Riscos remanescentes

- G — `gtin_lookup_cache` gravável por qualquer autenticado: um OPERADOR pode envenenar sugestões de cadastro por GTIN. Correção
  proposta: escrita só via RPC/service_role ou gerencial. Não implementado aqui por mudar fluxo de cadastro (precisa decisão de produto).
- H — kardex incompleto para estoque anterior a abr/2026 e 6 vendas de ago/2026: relatórios baseados em ledger divergem do saldo.
  Correção exige movimentos de "saldo inicial" — mexe em dado real, requer aprovação.
- `calcular_preco_produto` (SECURITY DEFINER) lê `produtos` sem RLS: preço de varejo/atacado de outra loja é legível por id (P3; preço não é segredo hoje).
- Homologação não tem dados; testes de fluxo completo dependem de PGlite/fixtures.

## 7. Testes

| Comando | Resultado |
|---------|-----------|
| `npm run test:fiscal-cancelamento-categoria -w fastproduct-backend` (novo) | OK — falha antes (23514 nos 2 caminhos), passa depois, idempotente, CHECK segue restritivo |
| `npm run test:hardening-residual -w fastproduct-backend` (novo) | OK — resultados idênticos, `search_path=""`, ausentes ignorados, authenticated com GRANT vê 0 linhas, service_role lê |
| `npm run test:fiscal-rpc-authz -w fastproduct-backend` | OK |
| `npm run test:fiscal-p0-pre-req -w fastproduct-backend` | OK |
| `npm run test:migration-status -w fastproduct-backend` | 16/16 |
| `npm run test:financeiro-loja -w fastproduct-backend` | 16/16 |
| `npm run test:go-live-01-isolamento -w fastproduct-backend` | OK |
| `npm run guard:migrations` / `guard:no-prod-target` | OK |
| Homologação (MCP, transação descartada) | cancelamento GERENTE → CANCELADO/CANCELAMENTO |

Os dois testes novos entram no job `ci-backend-supabase.yml`.
