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
