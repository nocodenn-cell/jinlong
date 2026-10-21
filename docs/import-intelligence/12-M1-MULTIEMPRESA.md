# 12 — Sprint M1: fundação multiempresa (execução local)

Escopo: ESPEC_MULTIEMPRESA_V1 etapas 0 a 3 (pré-condições, DDL aditiva, backfill, helpers) e o cadastro mínimo de módulo do ETAPA 4. Tudo em banco **local isolado**. Nenhuma migration foi aplicada em produção ou no Supabase compartilhado, nada foi deployado, nada foi pushed.

**Resultado em uma linha:** fundação implementada e testada localmente (29 checks de autorização, 0 regressões nos 43 scripts SQL existentes, rollback verificada até igualdade de schema). O módulo **não** está habilitado para nenhum cliente, e a persistência do Import Intelligence continua bloqueada (ver §9).

---

## 0. Pré-condições (etapa 0)

| Item | Evidência |
|---|---|
| Branch | `claude/import-intelligence-s1a`; commits anteriores preservados (`8a12c4bd`, `d4062caa`, `350f03c8`, `8210de70`, `d4713bcf`, `79e5cde4`) |
| Estado do Git antes da M1 | Árvore limpa exceto os arquivos desta sprint |
| PostgreSQL de teste | Container local `jl-import-s2a-pg` (PostgreSQL 17.11), porta apenas em `127.0.0.1`. Não há conexão com produção nem com o Supabase compartilhado |
| Histórico de migrations | 406 arquivos no repositório. Reaplicação completa em banco local: **406 ok, 0 falhas** (após completar o stub Supabase: schemas `auth`, `storage`, roles, publicação `supabase_realtime`, `cron.job`) |
| Drift conhecido | Produção rastreia 263 versões (`reports/prod_migrations.tsv`); repositório tem 406 arquivos. Não há como reproduzir produção fielmente sem clone autorizado. O baseline local é **o repositório**, não produção |
| Compatibilidade do provisionamento | `ensureLoja` (`pdv-importados/app/admin/provisionamento/actions.ts`) e `lojas.insert` em `gerente/configuracoes` criam lojas **sem** `empresa_id`. Por isso `lojas.empresa_id` fica **anulável** |
| Dados pessoais | Nenhum dado de produção foi copiado. Fixtures usam e-mails `@m1.test` e nenhum CNPJ |

Baseline de regressão congelado antes de qualquer mudança: `jl_baseline`, 43 scripts em `backend/scripts/*.test.sql`: **31 passam, 12 falham** (falhas pré-existentes: fixtures ausentes, extensão `unaccent` ausente no stub, reconciliações).

---

## 1. Migrations criadas

| Arquivo | Conteúdo | Natureza |
|---|---|---|
| `backend/supabase/migrations/20261010120000_m1_fundacao_multiempresa.sql` | `empresas`, `lojas.empresa_id` (anulável), `usuario_vinculos`, `plataforma_admins` (vazia), helpers `fp_*`, RLS/grants, catálogo de módulos, `empresa_modulos`, histórico imutável, `fp_modulo_ativo`, `fp_pode_modulo`, `ops_definir_modulo_empresa` | **Aditiva** |
| `backend/supabase/migrations/20261010120100_m1_backfill_empresa_legada.sql` | Tabelas de controle e exceções, função `m1_backfill_empresa_legada()` idempotente, execução da própria migration | Aditiva + dados de controle |
| `backend/supabase/rollback/20261010120000_m1_fundacao_multiempresa.rollback.sql` | Remove só o que a M1 criou (fora de `migrations/` para não colidir no guard de sequência) | Rollback |
| `backend/scripts/m1-multiempresa.test.sql` | 29 checks de autorização, em transação com `ROLLBACK` | Teste |

Nenhuma coluna legada foi removida ou renomeada (`usuarios.perfil`, `usuarios.loja_id` permanecem). Nenhuma policy ou RPC existente foi alterada.

---

## 2. Arquivos implementados

- As quatro arquivos acima.
- `docs/import-intelligence/12-M1-MULTIEMPRESA.md` (este documento).
- **Nenhum arquivo de aplicação TypeScript, parser, UI ou shared-core foi alterado nesta sprint.**

---

## 3. Contratos e helpers

**Reutilizados sem alteração:** `usuarios` (`perfil`, `loja_id`, `ativo`), `lojas`, `auth.uid()`, `auth_usuario_*` legados, `feature_flags` (não usado como licença).

**Novos (ESPEC §6):**

| Helper | Retorno | Regra |
|---|---|---|
| `fp_usuario_ativo()` | bool | usuário da sessão existe e está ativo |
| `fp_legado_admin_global()` | bool | ramo de compatibilidade ADMIN (ESPEC §6). Não é plataforma |
| `fp_eh_plataforma()` | bool | `plataforma_admins` ativo. **Hoje: ninguém** |
| `fp_empresas_do_usuario()` | setof uuid | empresas com vínculo ativo |
| `fp_lojas_permitidas(papeis)` | setof uuid | DONO → todas as lojas da empresa; GERENTE/OPERADOR → loja do vínculo |
| `fp_pode_loja(loja, papeis)` | bool | autorização de leitura/escrita por loja |
| `fp_pode_operar_loja(loja, papeis)` | bool | `fp_pode_loja` **e** empresa operacional. Porta recomendada para escrita |
| `fp_eh_dono_da_empresa(empresa)` | bool | DONO ativo |
| `fp_empresa_operacional(empresa)` | bool | status `ATIVA` e vigência válida |
| `fp_divergencias_vinculos_legados()` | tabela | compara `usuarios` com vínculos. Só service_role |
| `fp_pode_modulo(empresa, módulo, papeis=[DONO])` | bool | módulo habilitado + usuário com vínculo e papel permitido |

**Restrições aplicadas após o teste C1 (ver §7):** `fp_empresa_da_loja`, `fp_empresa_operacional`, `fp_mesma_empresa` e `fp_modulo_ativo` **não** são executáveis por `authenticated`. São oráculos entre tenants (revelam empresa de uma loja, licença de uma empresa ou módulo habilitado de qualquer empresa). Continuam para `service_role` e para os helpers que os usam internamente.

Helpers com contexto ausente retornam `false` ou conjunto vazio. Nenhum helper aceita `empresa_id` ou `loja_id` como autorização: o parâmetro seleciona e o helper decide com `auth.uid()`.

---

## 4. Testes e evidências

| Comando | Resultado |
|---|---|
| `psql -f backend/scripts/m1-multiempresa.test.sql` em `jl_m1` | **exit 0, 29 checks `M1 OK`**, rollback ao final |
| `psql -f backend/scripts/c1-secdef-sem-identidade.test.sql` em `jl_m1_reg` | **exit 0** (guarda de classe SECURITY DEFINER) |
| Regressão: 43 scripts existentes, antes e depois | **Idêntica** ao baseline: 31 PASS, 12 FAIL (mesmas falhas pré-existentes) |
| Regressão: script novo `m1-multiempresa.test.sql` | PASS (aparece como 44º, fora da comparação de 43) |
| Rollback: aplicar M1, rodar rollback, comparar `pg_dump --schema-only` com `jl_replay` | **Schema idêntico ao baseline** |
| `migration-sequence-guard.mjs` | OK |
| `rpc-gate-guard.mjs` | OK |
| `core-rule-guard.mjs` | OK |
| `domain-boundary-guard.mjs` | OK |
| `tsc --noEmit` em `shared-core` | Limpo (sem alterações de TS nesta sprint) |

**Lint:** o repositório não tem linter configurado para SQL; nenhum arquivo TypeScript foi alterado. Não há lint a executar além dos guardrails acima.

### Cobertura dos 12 testes obrigatórios (ETAPA 5)

| # | Requisito | Check no teste | Resultado |
|---|---|---|---|
| 1 | Empresa A não acessa dados novos de B | T1 (helpers e RLS em `empresas` e `usuario_vinculos`) | OK |
| 2 | Usuário sem vínculo não obtém autorização | T2 (identidade sem registro legado) | OK |
| 3 | Operador sem privilégio de dono | T3 | OK |
| 4 | Gerente só em lojas autorizadas | T4 (multi-loja A1+A2, B1 negada, não é dono) | OK |
| 5 | Empresa suspensa / vigência encerrada bloqueia operação | T5, T5b (leitura preservada) | OK |
| 6 | Usuário de outra empresa não aprova | T6 (DONO de B não opera em A) | OK |
| 7 | Falta de identidade provoca negação | T7 (authenticated sem claim), T7b (identidade inativa), T11 (service_role sem claim) | OK |
| 8 | Backfill repetido não duplica | T8, T8b, T8c (saldo de estoque inalterado, loja pós-corte não absorvida) | OK |
| 9 | Usuários antigos mantêm acesso | T9 (equivalência legado × vínculos: única divergência é o operador de loja sem empresa, esperada) | OK |
| 10 | PDV e financeiro sem regressão | Regressão de 43 scripts SQL existentes (idêntica) | OK |
| 11 | SECURITY DEFINER e service_role sem bypass nos caminhos novos | T11 (authenticated sem ops/backfill/divergências/plataforma/vínculos), T11b (oráculos negados), guarda C1 | OK |
| 12 | Módulo inacessível por padrão | T12 (desabilitado), T12a/f (habilitação exige motivo e autorização), T12c (só DONO), T12d/e (histórico imutável) | OK |

**Acesso direto por API/RPC, não só interface:** todos os checks rodam com `SET LOCAL ROLE authenticated` ou `service_role` e claims de sessão, chamando as funções e tabelas diretamente.

---

## 5. Comparação de comportamento antes/depois

| Aspecto | Antes (baseline) | Depois (M1) |
|---|---|---|
| Migrations do repositório | 406 aplicadas, 0 falhas (replay completo) | 406 + as 2 da M1 aplicadas sobre o baseline, 0 falhas (`jl_m1`) |
| Testes SQL existentes | 31 PASS / 12 FAIL | 31 PASS / 12 FAIL (idêntico) |
| Acesso de DONO, GERENTE, OPERADOR por loja | Regido por `usuarios.perfil` e `loja_id` | Mesmo acesso, verificado por T9 e pelo teste de equivalência |
| `usuarios`, `lojas` (dados legados) | — | Só `lojas.empresa_id` preenchido nas lojas existentes no corte. Nenhum outro campo alterado |
| Saldo de estoque | — | Inalterado (T8) |
| Lançamentos financeiros | — | Não tocados (migration não escreve em nenhuma tabela financeira) |
| Preços de produtos | — | Não tocados |
| Módulo IMPORT_INTELLIGENCE | Inexistente | Existe no catálogo, **desabilitado para todas as empresas** |

---

## 6. Partes da ESPEC concluídas

| ESPEC | Status |
|---|---|
| §0 Decisões D1–D19 | Respeitadas: D1 (ADMIN não é plataforma), D2 (papéis), D3 (vínculos multi-loja), D9 (ADMIN sem vínculo), D11 (`lojas.codigo` mantido), D14, D16 (guarda RESTRICTIVE **não** aplicada), D17 (aditiva), D18 (fail closed) |
| §1 Identidade | Não alterada (`usuarios.id` continua FK de `auth.users`) |
| §2 Empresa | **Concluído** (com `cnpj` nulo, sem CNPJ fictício) |
| §3 Loja | **Parcial**: `empresa_id` e `UNIQUE (id, empresa_id)` criados; `NOT NULL` **não** aplicado (provisionamento ainda cria lojas sem empresa). `lojas.codigo` mantido |
| §4 Vínculo | **Concluído** (incluindo `NULLS NOT DISTINCT` e índice de operador) |
| §5 Papéis | Modelo criado; `plataforma_admins` vazia |
| §6 Helpers | **Concluído** (conjunto da ESPEC mais `fp_eh_dono_da_empresa`, `fp_pode_operar_loja`, `fp_divergencias_vinculos_legados`). Modo de compatibilidade de ADMIN incluído |
| §7 RLS | **Não concluído**: nenhuma guarda RESTRICTIVE aplicada (decisão D16: só após bateria do §7.2) |
| §8 RPC | **Não concluído**: nenhuma RPC existente migrada para `fp_pode_loja` |
| §9 Sessão | **Não concluído**: `getRawSession` não alterado; `LOJA_MATRIZ_ID` não removido |
| §12 Etapas 0–3 | Etapa 0: verificada. Etapa 1: concluída. Etapa 2: concluída (backfill). Etapa 3: concluída |
| §12 Etapa 4 (sincronização legado → vínculos) | **Não concluída** (decisão desta sprint: não expandir) |
| §12 Etapas 5–13 | **Não iniciadas**, conforme a restrição |
| Anexo A (ADMIN de teste) | Tratado como exceção `ADMIN_SEM_VINCULO`; nenhum UPDATE/DELETE em produção |

**Módulo IMPORT_INTELLIGENCE (ETAPA 4 da sprint):** cadastro mínimo implementado, sem sistema de cobrança, sem `feature_flags`, sem CNPJ ou `loja_id` hardcoded.

---

## 7. Achados durante a verificação

1. **Regressão real encontrada e corrigida pelo teste C1.** Quatro helpers `fp_*` novos eram `SECURITY DEFINER` executáveis por `authenticated` e funcionavam como oráculos entre tenants. Corrigido: revogação de `authenticated` nos quatro, identidade explícita em `fp_pode_loja` e `fp_pode_operar_loja`, e teste T11b que prova o bloqueio. Sem o guardrail existente, isso passaria despercebido.
2. **Bug de desenho no backfill, corrigido antes de aplicar.** O backfill associava todo DONO à empresa legada, independentemente da loja. Corrigido: a empresa do vínculo é sempre a empresa da loja do usuário.
3. **Bug de fixture (não de produção), corrigido.** O teste de "sem vínculo" usava um GERENTE legado, que o backfill corretamente vincula. O caso de negação passou a usar identidade sem registro legado.
4. **Restrição da migration de rollback.** Policies dependem das funções `fp_*`; a rollback precisou remover as policies antes das funções.
5. **Stub de Supabase incompleto** no primeiro replay (colunas de `storage.buckets`, `cron.job`, publicação `supabase_realtime`). Corrigido no stub local, não no repositório.

---

## 8. Rollback

**Arquivo:** `backend/supabase/rollback/20261010120000_m1_fundacao_multiempresa.rollback.sql`

**O que remove:** todas as estruturas criadas pela M1 (tabelas, funções, policies, triggers, coluna `lojas.empresa_id` e sua constraint).

**O que não toca:** saldos, lançamentos, vendas, produtos, `usuarios`, `lojas` (exceto a coluna criada pela M1), colunas legadas.

**Perda:** apenas os metadados criados pela M1 (empresa legada, vínculos, histórico de módulos). Se algum código passar a depender desses metadados antes do rollback, o rollback deve ser precedido de decisão explícita.

**Verificado:** aplicação da M1 + rollback em cópia do baseline resulta em schema idêntico ao baseline (comparado com `pg_dump --schema-only`).

**Reversão parcial alternativa:** `ops_definir_modulo_empresa` pode desabilitar o módulo sem rollback (`p_habilitado = false`), preservando o histórico.

---

## 9. Dependências pendentes e bloqueios

| Item | Bloqueio | Destrava com |
|---|---|---|
| Sincronização `usuarios` → `usuario_vinculos` (ESPEC etapa 4) | Decisão de design: trigger ou RPC obrigatória. Sem isso, mudança de `usuarios.loja_id` não reflete em vínculo | Autorização para a etapa 4 |
| `lojas.empresa_id NOT NULL` | Provisionamento e configurações criam lojas sem empresa | Alterar os fluxos de criação |
| Guardas RESTRICTIVE, RPCs para `fp_pode_loja`, sessão | Fora do escopo; ESPEC etapas 5–9 | Autorização explícita |
| Plataforma (D9) | Nenhum admin de plataforma definido; `fp_eh_plataforma` é sempre falso | Decisão do produto sobre o ADMIN técnico |
| Persistência do Import Intelligence | Depende de identidade de tenant **e** de sincronização (acima) | Este sprint destrava a identidade; a sincronização ainda bloqueia a persistência |
| Stub Supabase | Os testes usam um `auth.uid()` simulado por `request.jwt.claim.sub`, sem o schema `auth` real | Clone autorizado de produção para validar RLS real |

---

## 10. GO / NO-GO

### 9. Habilitar o módulo por cliente: **NO-GO**

Motivos:
- O mecanismo de habilitação existe, mas **nenhuma sessão real consegue alterá-lo** (só `service_role`). Não há fluxo de autorização comercial aprovado.
- A sincronização `usuarios → vínculos` (ESPEC etapa 4) não existe. Enquanto não existir, uma mudança de loja de um usuário legado não se reflete na autorização nova.
- Não há clone de produção para validar RLS com o `auth` real.
- A decisão de quem é o administrador de plataforma (D9) continua pendente.

Pré-condições para reavaliar: sincronização implementada e testada, validação de RLS em clone autorizado, e decisão comercial registrada para a habilitação.

### 10. Iniciar a persistência específica do Import Intelligence: **NO-GO**

Motivos:
- Depende da sincronização de vínculos (acima), porque as tabelas do módulo precisam de autorização que hoje ainda pode divergir do legado.
- `lojas.empresa_id` anulável significa que loja sem empresa existe e precisa de tratamento explícito em qualquer tabela nova.
- O achado D-02 da Sprint 2A (custo unitário em `numeric(10,2)`) continua sem migração de escala aprovada.

O que **está** liberado para a próxima etapa: a identidade de empresa, estabelecimento e vínculo existe e está testada localmente. Isso remove o bloqueio de "não há identidade de tenant", que motivou a Sprint 2A.
