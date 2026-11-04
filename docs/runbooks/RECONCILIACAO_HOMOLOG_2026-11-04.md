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
