# Reconciliação de migrations — homologação (2026-11-04)

Escopo: `jinlong-homolog-palm` (`yvdilcmxyjafnnsfdtam`). Produção (`jinlong`, `kbabmewnahysfvlybiak`) não foi alterada: só leituras (`pg_proc`, ACL) e nenhuma escrita.

## Parecer

- **Homologação: NÃO aplicada.** A aplicação foi interrompida antes de qualquer escrita, porque o homolog não tem 23 migrations anteriores do repositório. Sem elas, `20261028101000` falha (não existe o schema `saas`) e as seguintes dependem dela.
- **Produção: NO-GO** para reconciliar agora. O check `migration-remote-drift` deve continuar vermelho até a decisão de reconciliação.

## 1. Confirmação do ambiente

- `yvdilcmxyjafnnsfdtam` = `jinlong-homolog-palm`, sa-east-1, ACTIVE_HEALTHY, separado de `kbabmewnahysfvlybiak` (`jinlong`).
- Os acessos de escrita usados nesta sessão foram todos explicitamente por `project_id`. Nenhuma escrita foi feita em produção.

## 2. Drift pré-existente no homolog (medido, não suposto)

Comparação entre os 457 arquivos de `backend/supabase/migrations/` e as 450 versões em `supabase_migrations.schema_migrations` do homolog:

- **Faltam no homolog 31 versões do repositório.** Dessas, 8 são da lista das 11 deste sprint (as três NF-e `20261030120000/130000/140000` estão presentes) e 23 são anteriores ou fora da lista:
  - `20261020100000`, `20261020110000`, `20261021115705`, `20261021120000`, `20261021130000`, `20261021130100`, `20261021130200`, `20261021130300`, `20261021190000`, `20261021200000`, `20261021201000`, `20261021202000`, `20261021210000`, `20261021231000`, `20261022000000`, `20261022001000`, `20261022010000`, `20261022020000`, `20261022100000`, `20261022110000`, `20261023120000`, `20261023130000` (adiada pela governança), `20261028120000`.
- **Schema `saas` inexistente no homolog** (`saas_tabelas` vazio; `saas.parametros` e `saas.assinaturas` ausentes). Esse schema é criado pelas migrations de cobrança da faixa 20261020. Sem ele, `20261028101000` e `20261028121000` não aplicam.
- **Registros sem arquivo correspondente no repositório:** 23 versões com timestamp (`20261029153523`…`20261030002520`, reaplicações de migrations já existentes) e `20261023200000`. É o mesmo padrão de drift por timestamp já documentado para produção.
- Não há ADMIN no homolog (`perfil` = DONO, GERENTE, OPERADOR; 5 usuários), então o corte ADMIN não teria efeito de dados aqui.

## 3. Rollbacks

| Migration | Rollback | Estado | Verificação |
|---|---|---|---|
| `20261028100000` | `backend/supabase/rollback/20261028100000_sec_token_gerente_loja_nula_fora_da_loja.rollback.sql` | **Escrito** | Testado em transação com ROLLBACK no banco local: restaura a função; reaplicar a migration reconstrói o ramo por empresa. |
| `20261028101000` | `backend/supabase/rollback/20261028101000_cobranca_correcoes_revisao_585.rollback.sql` | **Escrito** | Testado em transação com ROLLBACK no banco local: remove as 5 colunas `*_pendente`, `saas.assinar_locks` e as 4 funções; restaura as 2 funções de cobrança; ACL igual à de produção (`postgres` + `service_role`); reaplicar a migration recria tudo. |
| `20261029155000` | `ops/rollback_20261029155000_movimentos_estoque_log_transferencia_id.sql` | **Existente, corrigido** | Não estava em `backend/supabase/rollback/`; o caminho é `ops/` (raiz), referenciado pela própria migration e pelos docs de auditoria. O regex do INSERT de entrada não casava após a G14 (`p_produto_id` → `v_produto_destino`) e falhava fechado. Corrigido para capturar o nome da variável; testado com ROLLBACK: a coluna sai dos INSERTs e `v_produto_destino`/idempotência são preservados; reaplicar a migration funciona. |
| `20261028110000`, `20261028120100`, `20261028121000`, `20261028122000`, `20261030100000` | já existentes em `backend/supabase/rollback/` | Não reexecutados nesta rodada | Ver ordem de pré-requisitos no cabeçalho de cada um. |

**Ordem de reversão obrigatória** (cada rollback reescreve funções que as seguintes usam): `20261030100000` → `20261028122000` → `20261028121000` → `20261028120100` → `20261028110000` → `20261028101000` → `20261028100000`. `20261029155000` é independente da cadeia de token/cobrança, mas precisa de `ops/` no caminho correto.

**Limitação irreversível:** `20261028101000` faz `DROP COLUMN` das colunas de upgrade pendente. Se houver linhas com pedido pendente, elas se perdem. Em homolog não há, pelo que foi medido em `saas`; o schema nem existe. Em produção a migration não foi aplicada.

## 4. Backup recuperável

**Não foi feito backup.** As ferramentas disponíveis não geram dump completo do homolog. Criar branch Supabase tem custo, e você pediu para não gerar custo adicional. Não há, portanto, teste de restauração em ambiente isolado. Isso é pré-requisito antes de qualquer aplicação. O caminho recomendado é um dump lógico feito pelo dono do projeto (`pg_dump` com a senha do banco ou backup do painel), restaurado num banco local para teste.

## 5. Matriz das 11 migrations (homolog)

| Migration | Status no homolog | Efeito | Dependências | Riscos |
|---|---|---|---|---|
| `20261028100000` | não aplicada (dependências ok) | reescreve `internal.token_gerente_fora_da_loja` com a fronteira de empresa | `fp_empresa_da_loja` presente | baixo; sem dados |
| `20261028101000` | **bloqueada** | ALTER `saas.assinaturas`, 4 funções, tabela de locks, grants | **schema `saas` ausente** (+ faixa 20261020) | alto: depende de 23 migrations não aplicadas |
| `20261028110000` | não aplicada | backup e desativação de ADMIN; trigger de bloqueio; helpers sem ADMIN | depende de 100000 e 101000 | médio em produção (1 ADMIN inativo, sem vínculo); nulo no homolog |
| `20261028120100` | não aplicada | revogação de tokens por usuário inativo, tabelas e triggers | depende de 110000 | médio |
| `20261028121000` | não aplicada | parâmetro de provisionamento e contingência | **`saas.parametros` ausente** | bloqueada |
| `20261028122000` | não aplicada | funções de escopo ativo | 110000 | baixo |
| `20261029155000` | não aplicada | coluna `transferencia_id`, índice, reescrita de `transferir_estoque_seguro` | G14 presente no homolog | médio: a função já tem G14 e idempotência; a regex do rollback foi corrigida |
| `20261030100000` | não aplicada | função de token com dispositivo na loja | 120100 | médio (mesma função) |
| `20261030120000` | **presente** (via NF-e) | conciliação de duplicatas | — | conteúdo não reverificado nesta rodada |
| `20261030130000` | **presente** (via NF-e) | precisão documental | — | conteúdo não reverificado nesta rodada |
| `20261030140000` | **presente** (via NF-e) | precisão de quantidade | — | conteúdo não reverificado nesta rodada |

## 6. Testes locais dos rollbacks

Banco local `supabase_db_fastproduct` com as 459 versões aplicadas. Cada teste roda em transação terminada em `ROLLBACK` (os `BEGIN`/`COMMIT` dos arquivos são removidos):

- T1 `20261028101000`: rollback → 0 colunas `*_pendente`, locks e `cobranca_reservar_assinar` removidos, `cobranca_aplicar_evento` sem `plano_pendente`, ACL `{postgres, service_role}` → reaplicar → 5 colunas e locks de volta. **PASSOU.**
- T2 `20261028100000`: rollback → função sem `fp_empresa_da_loja` → reaplicar → com `fp_empresa_da_loja`. **PASSOU.**
- T3 `20261029155000` (ops/, após a correção): antes, os INSERTs listam `transferencia_id`; depois do rollback, não listam; `v_produto_destino` e idempotência preservados; reaplicar restaura a coluna. **PASSOU.** Antes da correção: falhou com `função não reconhecida` (fail-closed, comportamento correto).

## 7. Riscos

1. Aplicar as 11 em homolog sem a base `saas` e as 23 migrations antecedentes falha no meio da cadeia. Cada migration tem seu próprio `BEGIN`/`COMMIT`, então a sequência ficaria parcial e exigiria reconciliação manual.
2. Sem backup, nenhuma migration desta cadeia tem recuperação de dados comprovada. Os rollbacks cobrem o esquema; não cobrem linhas apagadas por `DROP COLUMN`/`DROP TABLE`.
3. Produção tem 11 migrations sem registro no histórico remoto. No homolog, `fp_admin_legado()` ainda contém o ramo ADMIN (verificado nesta rodada). O check de drift só volta a verde com reconciliação real.
4. Versões `remote_only` com timestamp dificultam o rastreio por nome; o check de governança compara por versão.
5. O documento `docs/ops/deploy-governance.md` diz que o deploy automático foi desligado em 20/10/2026. Não confirmado nesta rodada; é histórico até verificação.

## 8. Plano futuro de reconciliação (não executado)

1. Dump lógico completo do homolog pelo dono do projeto, restaurado localmente para teste.
2. Recriar o baseline de homolog: aplicar as 23 migrations antecedentes em ordem, cada uma com rollback testado no banco local.
3. Aplicar `20261028100000` → `20261028101000` → `20261028110000` → `20261028120100` → `20261028121000` → `20261028122000` → `20261029155000` → `20261030100000`, com checkpoint e teste de fluxo após cada uma.
4. Validar PDV, fechamento de caixa, estoque, NF-e, financeiro, RLS e isolamento multiempresa no homolog.
5. Só depois: produção, com janela, backup, label `deploy-prod:aprovado` e autorização explícita do dono. Nada disso foi executado.

## 9. Validação dos fluxos (não realizada)

A validação de fluxos (autenticação, provisionamento, PDV, estoque, NF-e, financeiro, RLS) não foi feita, porque nenhuma migration da cadeia foi aplicada no homolog. Os fluxos continuam validados apenas pelas rodadas anteriores (ver `docs/qa/`).

## 10. Resultado da aplicação no homolog (2026-11-04)

- **Backup:** `pg_dump` 17.11 do `yvdilcmxyjafnnsfdtam` gerado fora do repositório (`C:\Users\aoliv\Backups\jinlong-homolog\`, 2,4 MB), listado com `pg_restore --list` (2.387 entradas) e restaurado em `homolog_restore` (container local). Contagens batem com o remoto, exceto 2 policies de `cron.*` (extensão da plataforma, ausente no local).
- **Ensaio:** as 31 migrations rodaram sem erro, em ordem de versão, no banco restaurado (`ON_ERROR_STOP`).
- **Aplicação no homolog:** as 31 migrations aplicadas via `psql` em uma única execução com `ON_ERROR_STOP`, sem erro. Efeitos conferidos por consulta somente leitura: schema `saas` com 11 tabelas, 5 colunas `*_pendente`, `saas.assinar_locks`, `fp_sou_dono_da_empresa`, função de token com fronteira de empresa, `movimentos_estoque_log.transferencia_id`, `internal.usuarios_admin_corte_backup` e `internal.provisionamento_contingencia_log`. Contagens de dados não mudaram (usuarios 5, vendas 4, produtos 19).
- **Registro de histórico:** `supabase_migrations.schema_migrations` continua com 450 versões. O `psql` não grava o histórico, e não foi inserido manualmente para não equivaler a `migration repair`. Decisão pendente do responsável.
- **Não validado nesta rodada:** fluxos de PDV, caixa, estoque, NF-e, financeiro, RLS e isolamento multiempresa. A matriz de fluxos continua pendente.
- **Produção:** não alterada. O drift de produção (11 migrations sem registro) e o check `migration-remote-drift` seguem como estavam.

## 11. Sprint JL-HML-02: reconciliação do histórico e validação (2026-11-04)

### Etapa 1: auditoria prévia
- **Projeto e banco:** `yvdilcmxyjafnnsfdtam` (`jinlong-homolog-palm`), `current_database() = postgres`, PostgreSQL 17.11. Não é `kbabmewnahysfvlybiak`.
- **Integridade das 31 migrations:** fingerprint do catálogo (funções pelo corpo, colunas, constraints, triggers, policies, índices, views, enums) entre o homolog e a cópia restaurada que recebeu as mesmas 31. Todos os componentes batem. Contagens de linhas de 149 tabelas batem (mesmo md5).
- **Funções:** 437 funções, corpo idêntico (`md5(pg_get_functiondef)`).
- **Limite da prova:** ACLs de tabela e de função não são comparáveis, porque o dump foi feito com `--no-privileges`. Os privilégios críticos foram verificados diretamente no homolog (Etapa 4).
- **Três NF-e (`20261030120000/130000/140000`):** já registradas, sem `statements`. Verificadas por marcadores e estrutura: colunas com tipo e precisão, checks, comentários e marcadores das funções. Não foram alteradas.
- **Formato do registro:** `supabase_migrations.schema_migrations` tem `version`, `statements`, `name`, `created_by`, `idempotency_key`, `rollback`. As linhas existentes sem `statements` seguem o padrão das NF-e.

### Etapa 2: reconciliação
- **Mecanismo:** `supabase migration repair` não foi usado. A CLI não está logada e não há token, e o comando exigiria autenticação que não temos. Inseri 31 linhas (`version` e `name` do arquivo, `statements` e `created_by` nulos), no mesmo formato das NF-e já registradas. Única escrita: `INSERT` em `supabase_migrations.schema_migrations`, numa transação.
- **Resultado:** 450 → 481 versões. Nenhuma linha existente foi alterada, nada foi reaplicado.

### Etapa 3: validação do histórico
- **Arquivos do repositório (457):** todos registrados. Sem versão duplicada.
- **Registros sem arquivo (24):** `20261023200000` (`pdv_troca_operador_caixa`) e 23 versões de timestamp (`20261029153523` a `20261030002520`), reaplicações de migrations que já existem com outro número. Drift residual, o mesmo padrão de produção.
- **Reconhecimento:** `list_migrations` do Supabase lista as 31 novas com os nomes dos arquivos.
- **Divergência de governança:** `20261023130000` (growth001) está em `deferred-migrations.json` como adiada em produção, mas foi aplicada no homolog. É um dado para a decisão de produção, não uma correção feita aqui.

### Etapa 4: homologação funcional
Testes sem senha, com papel e JWT simulados, em transações com `ROLLBACK`. Rodaram na cópia restaurada, que tem os mesmos dados do homolog (hashes iguais). A cópia recebeu grants de superconjunto para `anon` e `authenticated`, para que só o RLS decida. Script em `docs/qa/evidencias/homolog_2026-11-04_isolamento_rls.sql`.

### Etapa 5: matriz

| FLUXO | STATUS | EVIDÊNCIA | DEFEITO | PRÓXIMA AÇÃO |
|---|---|---|---|---|
| Login real por perfil | NÃO TESTADO | Não há senhas de teste disponíveis; produção não foi usada | — | Fornecer contas de teste autenticáveis ou criar fixtures de teste no homolog, com aprovação |
| Autorização por perfil (JWT simulado) | PASSOU | OPERADOR vê 1 estoque (própria loja); GERENTE de outra empresa vê 0 de `e1`; DONO vê 6 de `e1` | — | Repetir com login real |
| Isolamento multiempresa | PASSOU | GERENTE da `e2` vê só a loja da `e2`; DONO da `e1` não vê estoque da Matriz (`e0`) | — | Ampliar a matriz com mais tabelas |
| Isolamento multiloja (OPERADOR) | PASSOU | OPERADOR vê estoque só da loja `a1`; vê as 4 lojas da própria `e1` (nome, sem estoque) e a loja de outra empresa pelo vínculo cadastrado | Observação: vínculo cadastrado do OPERADOR com loja de outra empresa (`TESTE JL01`) | Confirmar se o vínculo é intencional |
| `anon` sem JWT | PASSOU | 0 linhas em `vendas`, `estoque`, `caixas`, `usuarios`, `lojas`, `produtos`, `importacoes_nfe` | Risco: `anon` tem `SELECT` em 70 objetos de `public` | Revogar `SELECT` de `anon` onde não há uso público (ação futura, não feita) |
| PDV: abertura, venda, desconto, pagamento dividido, fechamento | NÃO TESTADO | Exige caixa aberto e escrita operacional | — | Teste com caixa de teste autorizado |
| Vendas em espera | NÃO TESTADO | Exige escrita | — | Idem |
| Estoque: entradas, saídas, transferências, ajustes | NÃO TESTADO | Exige escrita | — | Idem |
| Importação NF-e | NÃO TESTADO | Estrutura das 3 NF-e verificada; fluxo não executado | Suíte de NF-e inexecutável (D-4/D-5 em `PROXIMOS_PASSOS.md`) | Corrigir fixtures antes do teste |
| Contas a pagar e financeiro | PARCIAL | `contas_pagar` tem 0 linhas; OPERADOR vê 0 | — | Teste de baixa e recebível com dados de teste |
| Cancelamentos e devoluções | NÃO TESTADO | Exige escrita | — | Teste com venda de teste |
| Concorrência e idempotência | NÃO TESTADO | Exige escrita concorrente | — | Teste com duas sessões em homolog |
| RPCs: privilégios críticos | PASSOU | No homolog: `anon` sem EXECUTE nas 12 funções verificadas; provisionamento, cobrança e `consumir_token_autorizacao_operacao` só para `service_role`; `internal.token_gerente_fora_da_loja` sem `service_role` | — | — |
| RPCs ADMIN legado | PASSOU (com observação) | `fp_admin_legado()` retorna `false` (`SELECT false`); `auth_usuario_eh_admin` sem ADMIN; `usuarios` sem perfil ADMIN | `authenticated` ainda tem EXECUTE nas duas (inofensivo, retornam false) | Remover EXECUTE em ação futura |
| Segredos e dados | Observação | O dump e o registro têm dados e `vault.secrets` | — | Manter a pasta de backup restrita |

### Drift residual e riscos
1. **Produção:** o drift de 11 migrations sem registro continua. A reconciliação de produção precisa de decisão e autorização próprias.
2. **Homolog, ACL:** as ACLs de tabela e função não puderam ser comparadas pelo dump. Os privilégios críticos estão verificados, não todos.
3. **Homolog, histórico:** 24 registros sem arquivo, herdados de antes.
4. **Segurança:** `anon` tem `SELECT` em 70 objetos de `public`. O RLS bloqueia nos testes, mas a superfície é desnecessária.
5. **Fluxos de escrita:** a maioria dos fluxos do PDV, estoque, financeiro e NF-e não foi executada. Sem essa validação, não há parecer de GO para produção.

### Parecer
- **Homolog:** histórico consistente para as 31 migrations. Validação funcional parcial (isolamento e privilégios).
- **Produção:** NO-GO para reconciliação. Faltam login real com contas de teste, fluxos de escrita e a decisão sobre o drift.

## 12. Sprint JL-SEC-ANON: auditoria de privilégios do papel anon (2026-11-04)

### Método
- Inventário no homolog (`yvdilcmxyjafnnsfdtam`) com `aclexplode`, `has_table_privilege` e `has_function_privilege`, sem alterar nada.
- Cópia `homolog_real`: restaurada de dump **com privilégios** (`--no-owner`, sem `--no-privileges`), não com GRANTs artificiais. Fingerprint de ACL das schemas `public`, `internal` e `saas` (relações, funções e schemas) comparado com a fonte: funções e schemas idênticos. Relações: 6 objetos de `internal` diferem só em grants de `service_role` (não afetam `anon` nem `authenticated`; verificado).
- Sondas em transação com `ROLLBACK`, com `SET LOCAL ROLE anon` ou `authenticated` e JWT simulado (sem senha).

### Etapa 1: inventário
- **88 objetos** com qualquer privilégio de `anon` nas schemas de aplicação e de plataforma: 75 em `public` (63 tabelas e 12 views) e 13 de plataforma (`extensions`, `net`, `realtime`, `storage`).
- O "70" da análise anterior conta só `SELECT` em `public` e nas views; esta matriz usa o universo completo.
- **Origem dos privilégios:** os de `public` são grants diretos a `anon` (default privileges do Supabase). Os de plataforma são `PUBLIC` (herdado por `anon`).
- **RLS:** ligado em todas as tabelas de `public` com privilégio de `anon`. As views de `public` não têm RLS próprio; o efeito depende de `security_invoker`.
- **Funções acessíveis a `anon`:** nenhuma função de aplicação com `SECURITY DEFINER`. Funções de `public` acessíveis: `texto_sem_acento` e duas funções de trigger. Funções de `internal`: `fp_contexto_servidor` e `fp_empresa_selecionada`, bloqueadas por falta de `USAGE` no schema. O restante é de plataforma (`auth`, `extensions`, `net`, `realtime`, `storage`, `graphql_public`, `cron`).
- **Dados sensíveis expostos a `anon` (antes):**
  - `v_vendas_dia`: 1 linha, agregado de **4 vendas e R$ 20.040,00** de todas as empresas.
  - `v_top_produtos`: 1 linha. `v_venda_consistencia_anomalias`: 2 linhas.
  - `pg_stat_statements`: 4.783 linhas com texto de consultas de todos os usuários.

### Etapa 2: classificação
| Classe | Quantidade | Exemplos |
|---|---|---|
| NECESSÁRIO (uso público legítimo comprovado) | 0 no banco | o formulário comercial (`commercial_leads`) usa `INSERT` de `anon`, mas o grant não existe hoje (ver Etapa 5) |
| DESNECESSÁRIO — CRÍTICO | 3 | `v_vendas_dia`, `v_top_produtos`, `v_venda_consistencia_anomalias` (views sem `security_invoker`, rodam como `postgres`) |
| DESNECESSÁRIO | 72 em `public` | tabelas e views com RLS, sem uso público; RLS impede linhas |
| DESNECESSÁRIO (plataforma) | 12 | `pg_stat_statements`, `net`, `realtime.subscription`, `storage` |
| INDETERMINADO | 2 | `realtime.messages` (uso por realtime autenticado); `graphql_public.graphql` (app não usa GraphQL) |
| BLOQUEADO | — | `cron` e `internal` (schema sem `USAGE` para `anon`) |

Usos públicos verificados no código (fora de `node_modules`, `.next` e docs): o site (`site/lib/demoRequest.ts`) grava em `commercial_leads` com a chave `anon`; o hub (`hub/`) usa o token do usuário logado; nenhuma página consulta as três views. Nenhuma leitura pública legítima de `public` foi encontrada.

### Etapa 3: correção
- **Migration** `backend/supabase/migrations/20261104120000_sec_anon_privilegios_minimos.sql`:
  1. `security_invoker = true` nas três views que contornavam o RLS;
  2. `REVOKE ALL` de `anon` nas 75 relações de `public` (lista explícita, gerada do estado capturado);
  3. `texto_sem_acento`: EXECUTE só para `authenticated` e `service_role`; as duas funções de trigger sem EXECUTE para ninguém (o disparo do trigger não depende de EXECUTE, verificado); `internal.fp_*`: sem EXECUTE para `anon`.
  - Um bloco `DO` de verificação aborta a migration se qualquer garantia falhar.
- **Rollback** `backend/supabase/rollback/20261104120000_sec_anon_privilegios_minimos.rollback.sql`: restaura as views (`RESET security_invoker`), os mesmos privilégios de `anon` nas 75 relações e o EXECUTE das funções.
- **Fora da migration (plataforma):** `pg_stat_statements` e `net`, `graphql_public`, `storage` e `realtime`. Os donos são `supabase_admin` e `postgres` não os altera de forma confiável. Precisam de ação do Supabase ou de um papel privilegiado.

### Etapa 4: testes (cópia `homolog_real`, antes e depois)
| # | Teste | Antes | Depois | Status |
|---|---|---|---|---|
| 1 | Leitura anônima de dados sensíveis | `v_vendas_dia` 1 linha (4 vendas, R$ 20.040); `v_top_produtos` 1; anomalias 2; `pg_stat_statements` 4.783 | views: `permission denied`; `pg_stat_statements` continua legível (plataforma) | PASSOU nas views; **FALHOU** em `pg_stat_statements` (fora da migration) |
| 2 | INSERT, UPDATE e DELETE por anon | 0 tabelas de `public` com INSERT, UPDATE ou DELETE; DELETE sobre tabelas retorna 0 linhas (RLS) | igual; storage bloqueia DELETE direto | PASSOU |
| 3 | RPCs sensíveis | nenhuma RPC de aplicação executável por anon | `texto_sem_acento` e triggers bloqueados para anon; `net.http_get` continua enfileirando HTTP (plataforma) | PASSOU em `public`; **FALHOU** em `net` (fora da migration) |
| 4 | `authenticated` com perfis distintos | OPERADOR, GERENTE (`e2`) e DONO (`e1`) viam o agregado de vendas de todas as empresas | OPERADOR e GERENTE da `e2` veem 0 linhas nas views; DONO `e1` vê 0 vendas (as 4 vendas são de outra empresa) | PASSOU |
| 5 | Isolamento entre empresas e lojas | estoque e lojas já isolados | OPERADOR vê só o estoque de `a1` (1); GERENTE `e2` vê 0 do estoque `e1`; DONO `e1` vê 6 do estoque `e1` e 4 lojas da própria empresa | PASSOU |
| 6 | Regressão de funcionalidades | — | `texto_sem_acento` funciona para `authenticated`; trigger de caixa fechado dispara para `authenticated` com `CAIXA_FECHADO_STATUS_IMUTAVEL` (não erro de permissão); estoque e vendas de `authenticated` iguais | PASSOU |

Evidências: `docs/qa/evidencias/sec_anon_*.sql` e saídas em `docs/qa/evidencias/sec_anon_*.txt`.

### Etapa 5: riscos e parecer
**Riscos comprovados e não corrigidos nesta migration:**
1. **`pg_stat_statements`** (plataforma): `PUBLIC` lê o texto das consultas de todos os usuários. Ação: pedir ao Supabase, ou a um papel com privilégio, para revogar `SELECT` de `PUBLIC`.
2. **`net`** (plataforma): `anon` e `PUBLIC` têm `USAGE` e DML no schema. Confirmado: `anon` enfileira `net.http_get` (fila cresceu para 1). Permite chamadas HTTP de dentro do banco. Ação: revogar de `anon` e `PUBLIC`. Não há uso legítimo no código: o cron fiscal roda como `postgres` e não depende disso.
3. **`commercial_leads`** (regressão **preexistente**, não causada pela migration): a policy `commercial_leads_anon_insert` existe, mas `anon` não tem grant de `INSERT`. O formulário público do site deve falhar com `permission denied`. Não testado contra o site real. Decisão necessária: conceder `INSERT` só nessa tabela (com a policy já existente, `status = 'novo'`) ou desativar o formulário.
4. **`graphql_public.graphql`** (plataforma, INDETERMINADO): anon executa. O app não usa GraphQL. Ação: decidir se desliga a API GraphQL.
5. **Login, recuperação de senha e hub**: não testados com login real. O auth é feito pela API do Supabase (GoTrue), não por grants de `public`, e o hub usa token de usuário; por isso não devem ser afetados, mas a prova fica como NÃO TESTADO.

**Parecer:**
- **GO para aplicar a migration em homologação**, depois de aprovação do responsável, porque: a correção fecha o vazamento confirmado nas views; o rollback restaura exatamente o estado anterior (fingerprint de ACL igual antes e depois); os testes de regressão passaram.
- **Condição:** decidir sobre `commercial_leads` antes de aplicar, porque a migration não altera esse ponto.
- **NO-GO para produção** até: (a) validar a migration em homologação com login real; (b) resolver os itens de plataforma (1, 2 e 4); (c) decidir `commercial_leads`; (d) a reconciliação de produção (11 migrations sem registro) continuar pendente.

### Matriz dos 88 objetos (antes da migration)

Colunas: objeto | tipo | privilégios (anon direto · PUBLIC) | RLS | leitura pela sonda antes | classificação | ação. Saída completa em `docs/qa/evidencias/sec_anon_matriz_88_objetos.md`.

| Objeto | Tipo | Privilégios | RLS | Sonda (antes) | Classificação | Ação |
|---|---|---|---|---|---|---|
| extensions.pg_stat_statements_info | view | anon: - · PUBLIC: SELECT | nao | linhas=1 | DESNECESSÁRIO (vaza texto de consultas de todos os usuários) | PLATAFORMA: revogar de PUBLIC/anon (owner supabase_admin); fora da migration |
| extensions.pg_stat_statements | view | anon: - · PUBLIC: SELECT | nao | linhas=4783 | DESNECESSÁRIO (vaza texto de consultas de todos os usuários) | PLATAFORMA: revogar de PUBLIC/anon (owner supabase_admin); fora da migration |
| net._http_response | tabela | anon: - · PUBLIC: INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN | nao | linhas=0 · delete=0 | DESNECESSÁRIO (anon enfileira requisições HTTP) | PLATAFORMA: revogar de anon e PUBLIC (owner supabase_admin); fora da migration |
| net.http_request_queue | tabela | anon: - · PUBLIC: INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN | nao | linhas=0 · delete=0 | DESNECESSÁRIO (anon enfileira requisições HTTP) | PLATAFORMA: revogar de anon e PUBLIC (owner supabase_admin); fora da migration |
| public.caixas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.categorias_financeiras | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.categorias | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.clientes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_ajustes_auditoria | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_ajustes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_pagamentos_ajustes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_pagamentos | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_reconstrucao_auditoria | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_regras_funcionario | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_regras_historico | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_saldo_operador | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_vendedores_liquidas | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.comissoes_vendedores | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.configuracoes_gerais | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.descontos_venda | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.devolucoes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.documentos_fiscais_dlq | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.documentos_fiscais_eventos | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.documentos_fiscais_pendentes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.estoque_baixas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.estoque_reposicoes_cancelamento | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.estoque_reposicoes_devolucao | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.estoque | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.feature_flags | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.fiscal_provider_config | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.formas_pagamento | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.fornecedores | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.funcionarios_meta | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.funcionarios | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.gerente_auth_attempts | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.gerente_auth_rate_limits | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.historico_precos_produto | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.historico_tiers_crud | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.implantacao_checklist_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.implantacao_checklists | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.importacoes_nfe_duplicatas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.importacoes_nfe_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.importacoes_nfe | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.itens_venda | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.lojas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.marcas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.movimentacoes_caixa | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.movimentos_caixa | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.movimentos_estoque_log | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.ordens_compra_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.ordens_compra | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.pdv_config | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.precos_atacado | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.pricing_config_versions | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.produto_create_requests | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.produtos | tabela | anon: MAINTAIN,REFERENCES,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.regras_preco | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.relatorio_settings | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.remessa_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.remessas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.tipos_movimento_estoque | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.tokens_desconto_gerente | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.transferencias_idempotencia | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.usuarios | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_clientes_gerente | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_estoque_baixo | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_estoque_ledger_divergencia | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_fiscal_doc_status_event_mismatch | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_kardex_unificado | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | bloqueado (permissao/RLS) | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.v_top_produtos | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=1 | DESNECESSÁRIO — CRÍTICO (view contorna RLS; vazamento entre empresas) | MIGRATION: security_invoker=true + REVOKE de anon |
| public.v_venda_consistencia_anomalias | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=2 | DESNECESSÁRIO — CRÍTICO (view contorna RLS; vazamento entre empresas) | MIGRATION: security_invoker=true + REVOKE de anon |
| public.v_vendas_dia | view | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | nao | linhas=1 | DESNECESSÁRIO — CRÍTICO (view contorna RLS; vazamento entre empresas) | MIGRATION: security_invoker=true + REVOKE de anon |
| public.venda_pos_venda_itens | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.venda_pos_venda_operacoes | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.vendas_canceladas_auditoria | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.vendas_pagamentos | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.vendas | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| public.vinculos_fornecedor_produto | tabela | anon: MAINTAIN,REFERENCES,SELECT,TRIGGER | sim | linhas=0 | DESNECESSÁRIO (sem uso público; RLS impede linhas) | MIGRATION: REVOKE de anon |
| realtime.messages | tabela | anon: INSERT,SELECT,UPDATE | sim | linhas=0 | INDETERMINADO (realtime autenticado) | PLATAFORMA: investigar |
| realtime.subscription | tabela | anon: SELECT | nao | linhas=0 | DESNECESSÁRIO (metadado de assinaturas) | PLATAFORMA: revogar; probe bloqueou |
| storage.buckets_analytics | tabela | anon: DELETE,INSERT,SELECT,UPDATE | sim | linhas=0 · delete=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.buckets_vectors | tabela | anon: SELECT | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.buckets | tabela | anon: DELETE,INSERT,SELECT,UPDATE | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.objects | tabela | anon: DELETE,INSERT,SELECT,UPDATE | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.s3_multipart_uploads_parts | tabela | anon: SELECT | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.s3_multipart_uploads | tabela | anon: SELECT | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |
| storage.vector_indexes | tabela | anon: SELECT | sim | linhas=0 | DESNECESSÁRIO (DML sem uso público; policies só authenticated) | PLATAFORMA: revogar DML de anon; fora da migration |

## 13. Aplicação da correção de privilégios do anon no homolog (2026-11-04)

- **Antes:** `anon` lia 1 linha de `v_vendas_dia` (4 vendas, R$ 20.040,00) no homolog.
- **Aplicação:** migration `20261104120000_sec_anon_privilegios_minimos.sql`, em uma transação, com a verificação embutida (`DO $verify$`) passando. Executada no projeto `yvdilcmxyjafnnsfdtam` (homolog), nunca em `kbabmewnahysfvlybiak`.
- **Registro:** versão `20261104120000` gravada em `supabase_migrations.schema_migrations` com o identificador do arquivo, no mesmo formato das anteriores. Total: 482 versões.
- **Depois:** `anon` recebe `permission denied for view v_vendas_dia`. Nenhum privilégio de `anon` nas relações de `public` (0). As três views têm `security_invoker=true`. `texto_sem_acento` executável por `authenticated` e não por `anon`.
- **Não alterado:** itens de plataforma (`pg_stat_statements`, `net`, `graphql_public`, `storage`, `realtime`) e `commercial_leads` (INSERT de `anon` continua ausente, decisão pendente).
- **Produção:** não alterada.

## 14. Sprint JL-SEC-02: formulário comercial e segurança de plataforma (2026-11-04)

### Etapa 1: fluxo do formulário (auditado)
1. Formulário `components/TrialForm.tsx` faz `POST /pedido-demo` (JSON, sem dados sensíveis além de nome, loja e contato).
2. `app/pedido-demo/route.ts` (reutilizada, sem API nova): exige `application/json` e corpo até 4 KB, lê o IP, aplica limite de taxa (5 pedidos por IP em 10 min, em memória por instância), valida tudo com `validateDemoRequest` (`lib/demoRequest.ts`), descarta robôs pelo campo honeypot `website`, e só depois persiste.
3. **Achado (antes):** persistência via REST em `commercial_leads` com a chave anon. Com a decisão 4 (sem INSERT direto), esse caminho quebrava.
4. **Solução escolhida:** função `public.registrar_lead_comercial(...)` (SECURITY DEFINER, `search_path` fixo), que valida cada campo no banco e insere com os privilégios do dono. Único EXECUTE: `anon`. Nenhum INSERT para `anon` na tabela.
5. **Por que não service role:** o guard `lib/platform.test.ts` proíbe `service_role` no site, e uma credencial que contorna o RLS é desproporcional para um formulário. A função é o menor privilégio que funciona.

### Etapa 2: segurança (migration `20261104120000` e nova `20261104150000`)
Testes na cópia `homolog_real` (ACL real do homolog, com as duas migrations aplicadas), com `ROLLBACK`. Saídas em `docs/qa/evidencias/sec02_*`.

### Etapa 3: objetos Supabase (somente leitura)
Sondas com `anon` em transação revertida. Efeito demonstrado = resultado obtido com o papel `anon`.

### Etapa 4: matriz

| Fluxo | Status | Evidência | Defeito | Próxima ação |
|---|---|---|---|---|
| Formulário: validação no servidor | PASSOU | 16 testes unitários (`demoRequest.test.ts`) + validação no banco: protocolo, nome, loja, contato, canal, idioma, segmento, cidade, WeChat e UTM inválidos rejeitados (`sec02_formulario_rpc_saida.txt`) | — | — |
| Formulário: persistência só pelo backend (sem INSERT de anon na tabela) | PASSOU | `anon` recebe `permission denied` em INSERT e SELECT direto de `commercial_leads`; a função insere uma linha com `origem=site`, `idioma`, `status=novo`, `product=jinlong` | — | — |
| Formulário: gravação via RPC pela API REST (caminho HTTP) | NÃO TESTADO | A permissão para aplicar a migration no stack local foi negada pelo classificador de ações; o teste HTTP ponta a ponta não rodou | — | Aplicar `20261104150000` no stack local (ou homolog, com aprovação) e testar `POST /rest/v1/rpc/registrar_lead_comercial` com a chave anon |
| Formulário: proteção contra envios abusivos | PASSOU (com limite) | honeypot, limite de 5 por IP em 10 min, corpo até 4 KB, `Content-Type` obrigatório (`route.ts`) | O limite é em memória por instância: em produção sem estado compartilhado, o limite é aproximado. A função não tem limite próprio | Aceitar como risco baixo ou adicionar limite persistente (decisão) |
| Formulário: mensagens sem informação interna | PASSOU | erro de banco é só logado; o visitante recebe `unavailable`/`invalid` genéricos (`route.ts`, `handleDemoRequest`) | — | — |
| Formulário: coleta mínima | PASSOU | campos do formulário: nome, loja, contato, canal, segmento e idioma; cidade, WeChat e UTM são opcionais | — | — |
| Credenciais | PASSOU | nenhuma credencial nova; a chave anon é a mesma já usada, e o guard de isolamento do site continua valendo | — | — |
| `anon` sem acesso a vendas e dados internos | PASSOU | sonda: 0 linhas de domínio; `v_vendas_dia` negada (`sec02_sonda_anon_depois.txt`) | — | — |
| `authenticated` com acesso legítimo preservado | PASSOU (parcial) | OPERADOR vê estoque da própria loja (1); DONO `e1` vê o estoque da `e1` (6) e as 4 lojas da empresa; `texto_sem_acento` funciona | Não há fixture positiva de view: o DONO da empresa das vendas não existe na base de teste | Criar fixture de DONO da empresa com vendas |
| Isolamento entre empresas e lojas | PASSOU | GERENTE da `e2` vê 0 do estoque da `e1` e 0 vendas por views; DONO `e1` não vê vendas da outra empresa | — | — |
| Views com `security_invoker` | PASSOU | `reloptions = security_invoker=true` nas três views; `anon` negado | — | — |
| Regressões: trigger de caixa fechado | PASSOU | `CAIXA_FECHADO_STATUS_IMUTAVEL` para `authenticated` (não erro de permissão) | — | — |
| Regressões: testes do site | PASSOU | `npx vitest run` no site: 62/62 (após `npm ci` pela raiz do monorepo, lockfile sem alteração) | — | — |
| Regressões: testes do banco e do PDV | NÃO TESTADO | Não rodados nesta sprint | — | Rodar a suíte do PDV antes de aplicar em produção |
| `storage` | PASSOU (sem risco demonstrado) | INSERT em `storage.objects` por `anon`: RLS nega; UPDATE em `storage.buckets`: 0 linhas; DELETE direto: bloqueado por trigger | Privilégios DML amplos para `anon` no papel (configuração de plataforma) | Revisão de plataforma; sem ação demonstrável |
| `realtime` | NÃO DEMONSTRADO | `realtime.subscription` e `realtime.messages`: SELECT de `anon` retorna 0 linhas; INSERT falhou por falta de partição, então não provou nada | Privilégios amplos de `anon` no papel | Revisão de plataforma |
| `net` | FALHOU (demonstrado) | `anon` executa `net.http_get` e obtém um id de requisição (enfileirada em `net.http_request_queue`) | Anônimo consegue disparar requisições HTTP de dentro do banco | Revogar de `anon` e `PUBLIC` pelo administrador do projeto (não feito, conforme decisão 6) |
| `graphql_public` | NÃO TESTADO | Na cópia, `anon` não tem `USAGE` em `graphql_public`; no homolog o catálogo indica que tem. As duas fontes divergem | Divergência de ambiente, não resolvida | Testar no homolog com aprovação |
| `pg_stat_statements` | FALHOU (demonstrado) | `anon` lê 4.854 linhas de `extensions.pg_stat_statements` (texto de consultas de todos os usuários) | Vazamento de texto de consultas | Revogar `SELECT` de `PUBLIC` pelo administrador do projeto (não feito, decisão 6) |

### Migrations desta sprint
- `20261104150000_commercial_leads_registro_rpc.sql`: cria `registrar_lead_comercial`, EXECUTE só para `anon`, verifica que `anon` não tem privilégio direto na tabela. Rollback: `backend/supabase/rollback/20261104150000_commercial_leads_registro_rpc.rollback.sql` (remove a função).
- Não aplicada no homolog nesta sprint: falta a autorização específica para esta migration. A migration `20261104120000` já está aplicada no homolog.

### Pendências de decisão
1. Aprovar a aplicação de `20261104150000` no homolog e o teste HTTP ponta a ponta.
2. Decidir se o limite de taxa do formulário precisa ser persistente.
3. Decidir sobre a policy `commercial_leads_anon_insert`: sem grant de INSERT ela não tem efeito; pode ser removida em migration futura.
4. Pedir ao administrador do projeto a revogação de `pg_stat_statements` e de `net` para `anon`/`PUBLIC`.

## 15. Aplicação de 20261104150000 (registrar_lead_comercial) no homolog (2026-11-04)

- **Aplicação:** SQL exato do arquivo, em transação, com a verificação embutida. Versão registrada em `schema_migrations` (total: 483).
- **Estado depois:** `anon` tem EXECUTE em `registrar_lead_comercial` e nenhum privilégio direto em `commercial_leads`.
- **Teste HTTP no homolog (com a chave anon, sem gravar dados):**
  - RPC com protocolo inválido: HTTP 400, `LEAD_PROTOCOLO_INVALIDO`. PASSOU.
  - `GET` em `commercial_leads` por `anon`: HTTP 401, `permission denied`. PASSOU.
  - `INSERT` direto em `commercial_leads` por `anon`: HTTP 401, `permission denied`. PASSOU.
- **Caminho válido (RPC com dados corretos):** validado na cópia de banco com o mesmo SQL (ver `docs/qa/evidencias/sec02_formulario_rpc_saida.txt`). NÃO executado no homolog, para não gravar um lead de teste no CRM. Fica como NÃO TESTADO até um teste com aprovação.
- **Produção:** não alterada.

## 16. Teste E2E do formulário comercial no homolog (2026-11-04)

Autorizado pelo responsável, só no homolog `jinlong-homolog-palm` (`yvdilcmxyjafnnsfdtam`). Produção não foi usada; a URL e a chave vieram do próprio projeto de homolog.

| Item | Status | Evidência |
|---|---|---|
| Formulário: envio HTTP real (`POST /pedido-demo` do site, servidor de desenvolvimento apontado ao homolog, chave pública) | PASSOU | HTTP 201 com protocolo (`sec02_e2e_homolog_envio_1.txt`) |
| Persistência em `commercial_leads` | PASSOU | linha com `origem=site`, `status=novo`, `product=jinlong`, idioma e canal corretos |
| Visualização no CRM (hub) | NÃO TESTADO | `commercial_admins` tem 0 linhas no homolog: não há administrador do CRM. Um usuário autenticado comum vê 0 leads (PASSOU nesse caso). Criar um admin de teste exige autorização |
| Idempotência | FALHOU | a mesma solicitação gerou **dois** leads (protocolos `JL-261104-GWNBGY` e `JL-261104-BDT52J`). Não há chave de idempotência no contrato |
| Limpeza | PASSOU | DELETE por IDs exatos (2 removidos), com filtros de protocolo e de `utm_source`. Total de leads: 0, igual ao estado anterior |
| Efeitos externos (e-mail, notificação, integração) | PASSOU (não há) | a rota só grava na tabela; nenhum trigger em `commercial_leads` |

Limite de taxa (por instância): 5 envios inválidos do mesmo IP passam para a validação e o sexto retorna 429. Confirmado.

### Pendências adicionais (propostas, nada executado)
1. **Rate limit compartilhado, baixo custo:** o limite atual é em memória, por instância. Proposta sem serviço pago: tabela `commercial_lead_rate` com hash do IP e janela, e uma função `SECURITY DEFINER` que conta e recusa acima do limite, chamada pela rota antes da gravação. Exige migration e autorização próprias.
2. **Idempotência:** proposta: chave de idempotência gerada no formulário, guardada em coluna única; a função devolve o protocolo existente em repetição. Exige migration e autorização próprias.
3. **Policy `commercial_leads_anon_insert`:** sem grant de INSERT para `anon`, a policy não tem efeito. Proposta: `DROP POLICY` em migration futura, depois de confirmar que nenhum caminho depende dela.
4. **`pg_stat_statements` e `net`:** o impacto e a compatibilidade foram checados sem executar nada. `net` é usado pelo cron fiscal, que roda como `postgres` dentro de função `SECURITY DEFINER`, então revogar `anon` e `PUBLIC` não quebra esse fluxo. `pg_stat_statements` é lido pelo painel do Supabase com o papel do administrador. Ambos são de propriedade do `supabase_admin`, que o `postgres` não altera. Quem administra o projeto precisa executar a revogação, e antes deve confirmar a compatibilidade na documentação do Supabase.

## 17. JL-COM-03: idempotência e limite de taxa compartilhado do formulário (2026-11-04)

Autorizado para desenvolvimento e testes locais. **Nada foi aplicado no homolog nem na produção** nesta sprint.

### Causa raiz
1. **Duplicidade:** cada `POST /pedido-demo` gerava um protocolo novo e inseria uma linha nova. Reenvio do mesmo formulário (duplo clique, retry após falha de rede) criava lead duplicado. Confirmado no E2E do homolog: 2 linhas para uma tentativa.
2. **Limite não compartilhado:** o limite era um `Map` em memória por instância. Com várias instâncias, ou um serverless que recria o processo, o limite não vale; e chamadas diretas à RPC nem passavam pela rota.

### Arquitetura escolhida
- **Idempotência:** o navegador gera um UUID v4 por tentativa (chave nova quando o conteúdo muda). O banco guarda `idempotency_key` com índice único parcial e `request_hash` (sha256 dos campos, usado só para detectar reutilização com outro conteúdo; não é chave de deduplicação). `INSERT ... ON CONFLICT DO NOTHING` resolve a concorrência: reenvio idêntico devolve o protocolo original; reutilização com conteúdo diferente gera `LEAD_CHAVE_REUTILIZADA` (409).
- **Limite de taxa:** tabela `commercial_lead_rate_limit` com `bucket = 'ip:' || sha256(salt || IP)`. O IP vem do último item de `X-Forwarded-For` em `request.headers` (o que o edge da plataforma acrescenta); os itens anteriores, enviados pelo cliente, são ignorados. Contagem atômica por bucket (`INSERT ... ON CONFLICT DO UPDATE`). Janela de 10 minutos, máximo de 10 tentativas aceitas. Quando o limite é atingido, a transação inteira é revertida, então tentativas recusadas não estendem a janela. Retenção: buckets com janela vencida há mais de 1 dia são apagados (até 200 por chamada). O salt fica numa tabela sem grants e é gerado na migração.
- **Onde fica o limite:** dentro da própria função de registro, então vale para todas as instâncias e para chamadas diretas à RPC.
- **Falha do mecanismo:** salt ausente ou erro na tabela gera `LEAD_RATE_INDISPONIVEL` e nada é gravado (fail-closed). A rota responde 503 genérico.

### Alternativas descartadas
- **Redis, Upstash ou Vercel KV:** serviço externo, com custo e dependência nova. Descartado pela restrição de não contratar serviços pagos, e porque o PostgreSQL já existente resolve.
- **Limite em memória ou em cache da instância:** não é compartilhado. É o problema original.
- **Limite só na rota Next:** chamadas diretas à RPC contornam. Descartado.
- **IP em texto puro na tabela de controle:** dado pessoal sem necessidade. Descartado: usa-se hash com salt.
- **Confiar no primeiro item de X-Forwarded-For:** o cliente forja. Descartado: usa-se o último item.
- **Deduplicar por contato ou e-mail:** dado pessoal como chave, e bloqueia uma nova tentativa legítima do mesmo contato. Descartado.
- **service_role no site:** contorna o RLS. Descartado: o guard do site proíbe e não é necessário.

### Arquivos
- Migrations: `backend/supabase/migrations/20261104160000_commercial_leads_idempotencia.sql` e `20261104170000_commercial_leads_rate_limit.sql`.
- Rollbacks: `backend/supabase/rollback/20261104160000_commercial_leads_idempotencia.rollback.sql` e `20261104170000_commercial_leads_rate_limit.rollback.sql`.
- Testes SQL: `backend/scripts/sec03-commercial-leads.test.sql` (11 blocos). Concorrência: `backend/scripts/sec03-commercial-leads-concorrencia.sh`.
- Site: `site/lib/demoRequest.ts`, `site/app/pedido-demo/route.ts`, `site/components/TrialForm.tsx`, `site/lib/demoRequest.test.ts` (27 testes).
- Evidências: `docs/qa/evidencias/sec03_*`.

### Testes
| Teste | Status | Evidência |
|---|---|---|
| Primeiro envio válido | PASSOU | T1 (banco descartável) |
| Reenvio idêntico (mesma chave) sem duplicar | PASSOU | T2; concorrência (a): 10 sessões simultâneas, 1 linha, 1 protocolo |
| Reenvio concorrente | PASSOU | concorrência (a) |
| Chave reutilizada com conteúdo diferente | PASSOU | T3 (LEAD_CHAVE_REUTILIZADA, nada gravado) |
| Nova tentativa legítima | PASSOU | T4 |
| Payload inválido (8 casos) | PASSOU | T5 |
| Rate limit atingido | PASSOU | T6 (10 aceitas, 11ª recusada); concorrência (b): 20 simultâneas → 10 aceitas, 10 recusadas, contador 10 |
| Janela expirada libera | PASSOU | T8 |
| Retenção | PASSOU | T9 |
| X-Forwarded-For forjado no primeiro item | PASSOU | T7 |
| Bucket é hash, sem IP em texto puro | PASSOU | T6 |
| Falha do mecanismo (salt ausente) | PASSOU | T10 (fail-closed) |
| Permissões de anon (ler, alterar, apagar, tabela de limite, checagem) | PASSOU | T11 |
| search_path fixo e SECURITY DEFINER | PASSOU | T11 |
| Múltiplas instâncias (limite compartilhado) | PASSOU (simulado) | Vitest com banco fake compartilhado entre instâncias; concorrência (b) com sessões independentes |
| Falha de conexão (fetch) | PASSOU | Vitest: NETWORK vira 503 |
| Compatibilidade (cliente antigo sem chave) | PASSOU | Vitest: o servidor gera a chave |
| Rollback das migrations | PASSOU | Rollback B e A na base descartável: estado idêntico ao de `20261104150000`; reaplicação e suíte 9/9 OK |
| Formulário no navegador (geração e reenvio da chave na UI) | NÃO TESTADO | Não há teste de componente; ver riscos |
| Caminho HTTP real com a nova função (PostgREST e Kong) | NÃO TESTADO | Sem permissão para aplicar no stack local nesta sprint; o homolog não recebeu esta sprint |
| Limite com IP real atrás do edge (XFF de produção) | NÃO TESTADO | Depende da configuração do edge em produção |

Testes automatizados: suíte do site 73/73 (`npx vitest run`) e `tsc --noEmit` sem erros.

### Impacto no banco
- Tabelas novas: `commercial_lead_rate_limit` (uma linha por IP-hash na janela) e `commercial_lead_rate_config` (uma linha, com o salt). Sem grants para anon, authenticated ou PUBLIC.
- `commercial_leads`: colunas `idempotency_key` e `request_hash` (nulas para leads antigos) e índice único parcial.
- Função `registrar_lead_comercial` com a nova assinatura (13 argumentos, devolve text); a antiga (12 argumentos) é removida. Função interna `internal.commercial_lead_rate_check()`.
- Volume: uma linha de bucket por IP ativo na janela; a retenção mantém o volume baixo.

### Impacto na UX
- Reenvio do mesmo formulário devolve o mesmo protocolo, sem lead duplicado.
- Editar um campo e reenviar gera chave nova, sem erro para o visitante.
- Escritórios atrás do mesmo IP compartilham o limite de 10 envios a cada 10 minutos. Quem exceder vê a mensagem de limite já existente na UI.
- Em indisponibilidade, o visitante vê o mesmo aviso de "indisponível" e pode usar WhatsApp ou e-mail.

### Riscos residuais
1. **Confiança no edge:** o IP correto depende de o edge da plataforma acrescentar o IP do cliente ao final de `X-Forwarded-For`. Confirmar em produção antes de liberar.
2. **Limite por IP:** um IP compartilhado por muitos usuários pode bloquear uns aos outros acima de 10 envios a cada 10 minutos.
3. **Idempotência opcional:** só vale para clientes que enviam a chave. Clientes antigos continuam sem deduplicação de reenvios.
4. **Formulário no navegador:** a geração e o reenvio da chave na UI não têm teste automatizado de componente.
5. **Recusas não estendem a janela:** comportamento intencional, mas a janela só cresce com envios aceitos.
6. **Policy `commercial_leads_anon_insert`:** continua sem efeito (sem grant de INSERT para anon).

### Plano de implantação coordenada
1. Confirmar com o administrador do projeto que o edge acrescenta o IP do cliente ao final de `X-Forwarded-For` (teste em homolog com um envio real).
2. Aprovar a aplicação de `20261104160000` e `20261104170000` no homolog. Executar o teste HTTP ponta a ponta e os testes SQL no homolog, com lead marcado como teste e remoção por ID.
3. Publicar o site novo no mesmo intervalo em que as migrations entram em produção. Entre as duas publicações, o site antigo chama a assinatura de 12 argumentos, que deixa de existir: a janela de erro deve ser curta, ou deve-se manter um wrapper de compatibilidade (decisão a tomar antes).
4. Monitorar `LEAD_RATE_LIMIT`, `LEAD_RATE_INDISPONIVEL` e 409 nos logs durante a primeira semana.
5. Só depois, avaliar a remoção da policy sem efeito, em migration própria.

## 18. JL-GO-LIVE-01: validação operacional de PDV, caixa, estoque e financeiro (2026-11-04)

Escopo do passo desta sessão: rodar o gate financeiro do repositório contra o esquema real (cópia descartável de `jinlong-homolog-palm`, com os grants reais). Nenhuma escrita no homolog ou na produção.

### Resultado do gate (`npm run test:financial`, `FINANCIAL_TEST_PSQL` apontando para a cópia)
- **16 de 35 suítes passam**, incluindo: `financial-idempotency-correlation-contract`, `test-financeiro-loja`, `test-pdv-caixa-financeiro-fluxo`, `financeiro-hardening-full-schema`, `sale-totals-invariant`, `nfe-duplicata-invalida-aborta`, `sec-tokens-usuario-inativo`, `residual-grants-3-tabelas`, `fase1-hardening-grants-residuais`, `test-nfe-conferencia-concurrency`.
- **19 falham.** Causas comprovadas:
  1. **15 suítes SQL + 1 concorrência de estoque: fixture sem `empresa_id`.** O trigger `internal.tg_preenche_empresa_id` exige `empresa_id` em `lojas` quando há mais de uma empresa (regra da multiempresa, `EMPRESA_ID_OBRIGATORIA`). Os fixtures foram escritos antes da multiempresa e nunca rodaram no gate. A regra está certa; o teste precisa criar a empresa e informá-la. Não é defeito do produto.
  2. **`financial-adversarial-gates`: dependência de seed.** O teste exige um produto com margem entre 50% e 100% já existente na loja. Esse dado vem do seed de desenvolvimento e não existe no homolog.
  3. **`test-commission-concurrency`, `test-varejo-tier-concurrency`: causa não investigada** nesta sessão.

### Implicação para a validação operacional
- O gate financeiro **não é um sinal confiável hoje**: 19 falhas são de fixture, e as suítes que passam cobrem lógica, não o fluxo completo na base real.
- Os fluxos PDV, caixa, estoque e financeiro **não estão validados de ponta a ponta no esquema real**. A cobertura real depende de corrigir os fixtures e de criar cenários com venda, caixa aberto e estoque reais na cópia descartável.

### Próximo passo proposto (precisa de autorização de escopo)
1. Corrigir os 15 fixtures SQL: criar a empresa e informar `empresa_id` nas lojas. Sem enfraquecer nenhuma asserção.
2. Substituir a dependência de seed do `financial-adversarial-gates` por um produto criado no próprio fixture.
3. Investigar as duas suítes de concorrência de comissão e de tier.
4. Só então rodar o gate e os cenários operacionais (venda com desconto e pagamento dividido, fechamento, vendas em espera, cancelamento e devolução, transferência e ajuste de estoque, liquidação de recebível) na cópia descartável.

Recomendação: aprovar os passos 1 a 3 como uma sprint própria. Não tratar o gate como verde antes disso.

## 19. JL-GO-LIVE-01: correção dos fixtures e validação do gate financeiro (2026-11-04)

Escopo: corrigir os fixtures que falhavam pela regra multiempresa e rodar o gate financeiro na cópia descartável de `jinlong-homolog-palm`, com os grants reais. Nenhuma escrita no homolog ou na produção.

### Causa da maior parte das falhas (corrigida)
- Os fixtures criavam `lojas`, `categorias`, `marcas`, `regras_preco`, `configuracoes_gerais` sem `empresa_id`. O trigger `tg_preenche_empresa_id` exige o campo quando a base tem mais de uma empresa, e a cópia tem quatro. A regra é correta; os fixtures foram escritos antes da multiempresa.
- Correção: cada fixture cria uma empresa própria (`fa5e0000-…-f1`) e informa `empresa_id`. As asserções não mudaram.
- Duas causas de ambiente, também corrigidas: `storage.objects` da plataforma atual tem unicidade por `(bucket_id, name, version)`, e o `ON CONFLICT (bucket_id, name)` do fixture deixou de casar (agora `ON CONFLICT` sem alvo, só no fixture); o adversarial dependia de um produto de seed inexistente no homolog (agora o fixture cria um produto de margem 80%).

### Resultado do gate (`npm run test:financial`, cópia `homolog_real`)
- **31 de 35 suítes passam** (antes desta correção: 16 de 35).
- Os três scripts de concorrência (comissão, tier de varejo, decremento de estoque) passam após a correção do fixture.
- **4 falham, todas pelo mesmo ponto:** um GERENTE de outra loja da mesma empresa é recusado com `ACESSO_LOJA_NEGADO`, e o teste espera outro código:

| Suíte | Esperado pelo teste | Obtido |
|---|---|---|
| `ar-receipts-reconciliation` | `LIQUIDACAO_CAIXA_INVALIDO` (caixa de outra loja) | `ACESSO_LOJA_NEGADO` |
| `ap-payments-reconciliation` | equivalente para pagamento de conta a pagar | `ACESSO_LOJA_NEGADO` |
| `financial-adversarial-gates` (GATE6) | `LIQUIDACAO_PERFIL` | `ACESSO_LOJA_NEGADO` |
| `fase6-consolida-padrao-a-dono-global` | `ATUALIZAR_PRODUTO_NAO_ENCONTRADO` (sem revelar produto alheio) | `ACESSO_LOJA_NEGADO` |

**Análise:** em todos os casos a operação é recusada, então a regra de isolamento vale. O que diverge é o código e a ordem das guardas: a guarda de loja (`ACESSO_LOJA_NEGADO`) roda antes da regra específica. No caso de `atualizar_produto_com_faixa_atacado`, a mensagem diferente de "não encontrado" revela que o produto existe em outra loja. Isso é um achado de segurança de baixa severidade.

**Não alterei as expectativas dos testes**, para não mascarar a divergência. Precisa de decisão de produto: qual código é o contrato. Recomendação: padronizar a resposta de produto alheio como "não encontrado" (sem vazar existência) e definir qual código a guarda de loja devolve para caixa e conta de outra loja. Depois disso, ajustar a função ou o teste, conforme a decisão.

### Não executado nesta sprint
- Cenários operacionais além do gate: venda com desconto e pagamento dividido, vendas em espera, cancelamento e devolução com estoque, transferência e ajuste de estoque, fechamento de caixa com diferença. O gate cobre parte deles na forma de testes de lógica, não o fluxo completo de tela.
- Testes de tela (navegador) do PDV.

### Artefatos
- Commits locais: `26d8b346` (fixtures SQL), `baa362d5` (concorrência), `b8fd1e3c` (saída do gate).
- Evidência: `docs/qa/evidencias/go-live-01_gate_financeiro_final.txt`.
- Efeito colateral na cópia: a empresa fixture `fa5e0000-…-f1` permanece criada (as suítes de concorrência confirmam). Não afeta o homolog.

### Veredito
- **GO-LIVE-01: NO-GO continua.** Gate em 31/35, com quatro divergências de contrato de erro que precisam de decisão de produto. Cenários operacionais completos ainda não validados.
- Próximo passo: decidir o contrato de erro das guardas de loja e autorizar a rodada de cenários operacionais na cópia descartável.
