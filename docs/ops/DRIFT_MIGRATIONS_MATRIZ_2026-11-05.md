# Drift `remote_ausente` — auditoria e matriz de decisão (2026-11-05)

**Status:** análise somente leitura. Nenhuma migration aplicada, nenhum registro em `schema_migrations`, nenhuma alteração no manifesto `.github/deploy-governance/deferred-migrations.json`, nenhum merge, nenhuma alteração de produção.

**Projeto remoto consultado (somente `SELECT`):** `jinlong` (`kbabmewnahysfvlybiak`).

## 1. Fatos verificados no remoto (produção)

| Verificação | Resultado |
|---|---|
| Versões das 11 migrations bloqueantes em `supabase_migrations.schema_migrations` | **nenhuma** registrada |
| Total de migrations registradas | 446 |
| Empresas / lojas | 1 / 1 |
| Usuários: total / ADMIN / ADMIN ativo | 11 / 1 / 0 |
| Vínculos ativos de ADMIN | 0 |
| Usuários ativos DONO/GERENTE/OPERADOR sem vínculo ativo | **0** (de 7 ativos; 4 inativos) |
| Tokens de desconto pendentes / tokens de operação pendentes | 2 / 0 |
| Objetos criados pelas migrations já existem? | `public.plataforma_provisionar_empresa` **sim**; `fp_sou_dono_da_empresa`, `cobranca_reservar_assinar`, `movimentos_estoque_log.transferencia_id` **não** |
| NF-e de entrada não finalizadas (status ≠ CONFIRMADA/CANCELADA) | 6 |

Leitura: o impacto de dados em produção hoje é pequeno (um ADMIN inativo, 2 tokens pendentes, uma empresa). O risco está no código: o remoto não tem as correções de isolamento e as correções financeiras da NF-e.

## 2. Matriz por migration

Legenda de risco: **Alto** = afeta isolamento entre empresas, dinheiro ou acesso; **Médio** = afeta fluxo operacional com falha recuperável; **Baixo** = aditivo.

### 2.1 Segurança (6 migrations)

| # | Migration | 1. Finalidade | 2. Alterações no banco | 3. Risco de segurança (hoje) | 4. Impacto operacional | 5. Dependências | 6. Homologação | 7. Critério objetivo de liberação | 8. Adiamento seguro? |
|---|---|---|---|---|---|---|---|---|---|
| A | `20261028100000_sec_token_gerente_loja_nula_fora_da_loja` | Token de gerente emitido por DONO/ADMIN não vale em outra empresa | `CREATE OR REPLACE internal.token_gerente_fora_da_loja`; `REVOKE` | **Alto** (vazamento entre empresas), mitigado hoje por haver 1 empresa | Baixo: só muda a função | Base das demais (101000, 110000, 1030100000 reescrevem a mesma função) | **Sim** (teste `sec04` passou no banco descartável) | Teste `sec04-token-gerente-tenant` passa em homologação + rollback validado + 1ª aplicação da cadeia | **Possível a curto prazo** só com 1 empresa; **não** após a 2ª empresa |
| B | `20261028110000_corte_admin_papeis` | Perfil ADMIN perde poder nas lojas; ADMIN sem vínculo DONO é desativado | DDL: tabelas de backup, trigger que bloqueia ADMIN novo, `CREATE OR REPLACE` de `fp_pode_loja`, `auth_usuario_eh_admin`, `vincular_usuario_loja`. **DML:** `UPDATE public.usuarios` (perfil → DONO ou `ativo=false`) | **Alto** (ADMIN tem escopo global nas RPCs e policies) | **Médio**: `fp_pode_loja` é usada por guardas de todas as RPCs; regressão = bloqueio amplo. Dados: 1 ADMIN inativo, 0 vínculos ativos | 100000 (cabeçalho); 1030100000, 122000 dependem dela | **Sim** (suite de corte ADMIN e rollback existem; não rodada em homologação com o estado atual) | Suites de RPC/RLS verdes em homologação; backup lógico das tabelas afetadas; checagem de que nenhum DONO/GERENTE perde acesso | **Possível**: o caminho ADMIN global está inerte (0 ADMIN ativo). Reativar qualquer ADMIN reabre o risco |
| C | `20261028120100_sec_tokens_usuario_inativo_revogacao` | Usuário inativo ou sem vínculo não usa tokens antigos; revogação ao inativar | `ALTER TABLE` tokens; índices; `CREATE` de `fp_usuario_ativo_com_papel`, `tg_token_gerente_consumo`, `tg_revogar_tokens_usuario`; triggers em `tokens_*` e `usuarios` | **Alto** (tokens de usuário inativo continuam válidos) | **Médio**: validação ao consumir pode recusar token legítimo se houver vínculo faltando (hoje: 0 casos) | Depende de 100000 e 110000 (cabeçalho). **Não** cobre ADMINs desativados pela 110000 antes dela (o trigger só age em UPDATE futuro; a checagem no uso cobre esse caso) | **Sim** (48 casos no banco descartável) | 48 casos verdes em homologação com contas reais DONO/OPERADOR; token de usuário inativo recusado | **Possível com risco médio**: 2 tokens pendentes hoje; a checagem no uso já limita o dano |
| D | `20261028121000_provisionamento_automatico_bloqueado` | Provisionamento automático de empresa vira fail-closed; contingência documentada | Renomeia `public.plataforma_provisionar_empresa` para `internal.…_nucleo`; nova função pública fail-closed; `saas.parametros`; log de contingência | **Alto** hoje: a função pública **existe e está aberta** em produção | **Alto** operacional: bloqueia criação automática de empresa e o teste grátis (`plataforma_iniciar_trial`). Conflita com o **teste controlado de provisionamento em produção** (ainda sem aprovação, P0 do `PROXIMOS_PASSOS`) | 100000 (cabeçalho); PR #584 (núcleo já no remoto) | **Sim** (núcleo intacto; contingência testada em homologação?) — **verificar** | Decisão do dono sobre o teste controlado; procedimento de contingência testado em homologação | **Possível com decisão explícita**: manter aberto significa provisionamento sem gate em produção |
| E | `20261028122000_admin_residual_escopo_ativo` | RLS e RPCs gerenciais exigem usuário ativo e vínculo atual | `CREATE OR REPLACE` de `auth_usuario_gerencial_loja` (usada em 9 policies), `produtos_custos_autorizados` (custo de produto), `listar_caixas_elegiveis_desembolso` | **Alto** (custos e caixas de outra empresa visíveis a ADMIN) | **Médio**: altera 9 policies de RLS. Pré-condição verificada: **0** usuários ativos sem vínculo ativo, então ninguém perde acesso hoje | 110000 e 120100 (`fp_usuario_ativo_com_papel` está em 120100 — **obrigatoriamente depois dela**) | **Sim** (suite de isolamento) | Suite de isolamento verde em homologação; pré-condição de vínculo repetida no dia da aplicação | **Não recomendado**: é a correção do vazamento de custos entre empresas |
| F | `20261030100000_sec_token_dispositivo_vale_na_loja` | Token emitido pelo dispositivo (PDV) passa a valer na loja quando o aprovador está ativo | `CREATE OR REPLACE internal.token_gerente_fora_da_loja` (sem DML) | **Médio** (corrige regra, não abre acesso novo) | **Alto hoje**: a versão em produção recusa **todo** token de dispositivo (emissor ausente = fora); vendas offline com desconto podem falhar no `sync-outbox` | **Depende de 120100** (usa `fp_aprovador_ativo_na_empresa`): aplicar antes quebra a função | **Sim** (teste PR #652/#653) | Venda offline com token de dispositivo aceita em homologação e recusa com aprovador inativo; label `deploy-prod:aprovado` (regra do repositório) | **Não recomendado**: mantém PDV offline quebrado |

### 2.2 Cobrança (1 migration)

| # | Migration | 1. Finalidade | 2. Alterações | 3. Risco | 4. Impacto operacional | 5. Dependências | 6. Homologação | 7. Critério | 8. Adiamento |
|---|---|---|---|---|---|---|---|---|---|
| G | `20261028101000_cobranca_correcoes_revisao_585` | Correções da revisão de segurança da cobrança Asaas: upgrade só após pagamento, estorno suspende, lock por empresa, `fp_sou_dono_da_empresa` | `ALTER saas.assinaturas` (colunas `*_pendente`); funções de webhook e de assinatura; tabela `saas.assinar_locks` | **Médio**: cobrança indevida ou acesso sem pagamento, mas a ação de assinar está atrás da flag GROWTH-001 (desligada) | **Alto hoje**: a página `admin/assinatura` chama `fp_sou_dono_da_empresa` e `cobranca_reservar_assinar`, que **não existem** em produção; o DONO é negado (fail-closed). Esse é o P1 já registrado | Cabeçalho de 110000 cita 101000; teste em banco descartável indica que a tranche passa sem ela (decisão de negócio do dono) | **Sim**, mas o produto depende dela | **Decisão de produto do dono** (qual revisão de cobrança) antes de SQL | **Possível**, mas o adiamento mantém a página quebrada para o DONO. Decisão de produto, não técnica |

### 2.3 Operacional (1 migration)

| # | Migration | 1. Finalidade | 2. Alterações | 3. Risco | 4. Impacto operacional | 5. Dependências | 6. Homologação | 7. Critério | 8. Adiamento |
|---|---|---|---|---|---|---|---|---|---|
| H | `20261029155000_movimentos_estoque_log_transferencia_id` | Rastreabilidade de transferência no kardex (issue #586) | `ALTER TABLE movimentos_estoque_log ADD COLUMN transferencia_id` (NULL); índice; `CREATE OR REPLACE transferir_estoque_seguro` | **Baixo** (sem mudança de autorização, saldo ou idempotência, segundo o cabeçalho) | **Baixo/médio**: `CREATE INDEX` não concorrente em tabela de kardex pode travar escrita por instantes. **Não há rollback no repositório** (o registro do changelog cita `ops/`, que não existe) | Nenhuma das outras 10 | **Sim** (`transferencia-id-kardex.test.sql` roda na CI) | Criar rollback **antes** de aplicar; índice `CONCURRENTLY` ou janela de baixa carga | **Possível**: é rastreabilidade, não segurança |

### 2.4 Fiscais — NF-e de entrada (3 migrations)

| # | Migration | 1. Finalidade | 2. Alterações | 3. Risco | 4. Impacto operacional | 5. Dependências | 6. Homologação | 7. Critério | 8. Adiamento |
|---|---|---|---|---|---|---|---|---|---|
| I | `20261030120000_nfe_conciliacao_duplicatas` | Confirmação da NF-e exige que as duplicatas somem o valor da NF (tolerância R$ 0,01). Hoje NF de 100 com duplicata de 60 gera AP de 60 | Reescreve `internal.confirmar_importacao_nfe` **por substituição de texto** sobre `pg_get_functiondef` | **Alto** (conta a pagar com valor errado = dinheiro) | **Alto**: 6 NF-e não finalizadas no remoto podem ser confirmadas com o defeito | Antes de 130000 (mesma função, aplicada por texto) | **Não confiável hoje**: a suíte de NF-e não executa (fixtures sem `empresa_id`), conforme o P0 existente | Suite de NF-e corrigida e verde em homologação, incluindo o caso 100 × 60 | **Não recomendado**: defeito financeiro em produção |
| J | `20261030130000_nfe_precisao_documental` | Exigível por item com valor documental (caso 7 × 3,335) | Altera `importar_nfe_transacao` e `confirmar_importacao_nfe` **por texto**; `ALTER importacoes_nfe_itens` | **Alto** (custo e exigível) | **Alto**: muda cálculo de custo na importação; o `nfeParser` já lê `vProd` (conferir versão do app em produção) | 120000 antes; 140000 depois | Igual à I | Igual à I, mais conferência do parser no app | **Não recomendado** sem a I |
| K | `20261030140000_nfe_qtd_precisao` | Quantidade comercial exata; importação recusa item que não cabe em 3 casas, em vez de arredondar | `ALTER importacoes_nfe_itens`; regra de recusa | **Médio** (arredondamento silencioso hoje) | **Médio**: pode recusar uma NF legítima (raro); a recusa é explícita (`IMPORT_NFE_QTD_PRECISAO`) | 130000 antes | Igual à I | Igual à I + caso de NF com qCom de 4 casas | **Possível por pouco tempo**, mas o arredondamento silencioso continua |

**Totais:** segurança 6 · cobrança 1 · operacional 1 · fiscal 3 = **11**.

## 3. Recomendação individual (resumo)

| Migration | Recomendação | Quando |
|---|---|---|
| A 100000 | **Aplicar** (primeira da cadeia) | Após homologação verde |
| B 110000 | **Aplicar** | Após A, com backup lógico e suite de RPC |
| C 120100 | **Aplicar** | Após B; antes de D/E/F |
| D 121000 | **Decisão do dono** (teste controlado de provisionamento) | Separada da cadeia |
| E 122000 | **Aplicar** | Após C |
| F 1030100000 | **Aplicar** | Após C; antes disso quebra a função |
| G 101000 | **Decisão de produto** | Antes de qualquer SQL de cobrança |
| H 1029155000 | **Adiar até existir rollback**, depois aplicar | Janela de baixa carga |
| I 120000 | **Não aplicar** até a suite de NF-e funcionar | Depois de corrigir fixtures |
| J 130000 | Igual à I, em sequência | Após I |
| K 140000 | Igual à I, em sequência | Após J |

## 4. Resolver o drift por etapas, sem enfraquecer o gate e sem registrar o que não foi aplicado

O gate compara arquivos com `supabase_migrations.schema_migrations` e bloqueia `remote_ausente`. Caminhos válidos:

1. **Aplicar uma migration por vez, verificar e só então registrar** com o comando do CLI, usando **a versão do arquivo**: `supabase migration repair --status applied <versão>`. O registro vem depois da aplicação e da verificação; nunca antes. Cada migration sai da lista de bloqueantes quando registrada.
2. **Adiar no manifesto, por versão**, com `releaseCondition` explícita (`.github/deploy-governance/deferred-migrations.json`). É o mecanismo previsto para decisões de governança. Muda a classificação para "adiada" e exige decisão do dono e label. Não altera o código do gate, mas a adiada continua sem estar aplicada: registre-a no runbook.
3. **Não usar** o `migration-human-gates.json` para isso: ele só trata pares `git_only`/`remote_only` (mesma migration aplicada com outra versão). Não se aplica a `remote_ausente`.
4. **Não usar** `supabase db push`: aplicaria também a 101000 e outras pendentes, sem decisão.
5. **Não** remover entradas do gate nem alterar `remote_ausente` para aviso.

Com (1) para as que forem aplicadas e (2) para as que o dono decidir adiar, o check fica verde **sem** enfraquecer o gate e sem registrar nada que não foi aplicado.

## 5. Sequência segura de execução (proposta)

**Fase 0 — pré-requisitos, sem produção**
- Corrigir a suíte de NF-e (fixtures com `empresa_id`), pré-requisito das I, J e K.
- Criar o rollback da H (`20261029155000`) e validá-lo.
- Recriar um banco de homologação limpo e aplicar as 11 (ou as que forem aprovadas) em ordem, com o gate de drift apontando para ele.

**Fase 1 — segurança (com autorização expressa do dono e backup lógico)**
1. A `100000` → registrar
2. B `110000` → registrar (backup de `usuarios`/`usuario_vinculos` antes; é o único passo com `UPDATE` de dados)
3. C `120100` → registrar
4. F `1030100000` → registrar (depois de C)
5. E `122000` → registrar (depois de B e C)

**Fase 2 — NF-e (depois da suíte corrigida e de conferir as 6 NF-e não finalizadas)**
6. I `120000` → J `130000` → K `140000`, cada uma com registro.

**Fase 3 — operacional**
7. H `1029155000`, após o rollback.

**Decisões do dono, fora da sequência**
- D `121000`: decidir o teste controlado de provisionamento e a contingência.
- G `101000`: decidir a revisão de cobrança. Hoje a página `admin/assinatura` falha para o DONO.

Quando todas as decididas forem aplicadas e registradas, ou adiadas no manifesto com condição de liberação, o `migration-remote-drift` fica verde sem alterar o gate.

## 6. O que não foi verificado

- Não rodei as 11 em homologação nesta análise: só leitura.
- Não confirmei, no remoto, colunas que as migrations de NF-e alteram por `ALTER` (ex.: colunas de `importacoes_nfe_itens`). Confirmar antes da Fase 2.
- Não verifiquei se `public.plataforma_provisionar_empresa` em produção é a versão que a 121000 espera (o cabeçalho cita o PR #584).
- A correção da 110000 para um ADMIN inativo depende de checagem caso a caso; com 1 ADMIN inativo o efeito é mínimo.
