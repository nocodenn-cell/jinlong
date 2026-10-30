# Sprint corretiva de NF-e — estado e evidências (2026-10-30)

Entrega parcial para aprovação. Sem merge, deploy ou alteração de produção. Sem motor de custo médio.

---

## 1. Valor exigível (Decisão 1)

**Definições**

| Conceito | Definição | Onde está no código |
|---|---|---|
| Valor do documento | Σ(`quantidade_nfe` × `custo_unitario`), o que a NF-e informa | `importacoes_nfe_itens` (custo da NF, pré-conferência) |
| Valor conferido | Σ(`quantidade_conferida` × `custo_unitario`) | `internal.confirmar_importacao_nfe`, bloco de conciliação |
| Obrigação exigível (contrato provisório, SSOT-003) | Igual ao valor conferido | mesma função |
| Obrigação registrada | Σ `contas_pagar.valor_total` com `nfe_importacao_id` | `contas_pagar` |

Regra vigente: as duplicatas da NF devem somar o valor conferido, com tolerância de R$ 0,01.

**Limites documentados e testados** (`backend/scripts/nfe-conciliacao-exigivel.test.sql`, homologação, rollback):

| Caso | Resultado | Leitura |
|---|---|---|
| T1 — custo unitário 3,335 × 7 (documento 23,345; duplicata 23,35) | **Recusado** (`IMPORT_NFE_DUPLICATAS_DIVERGENTES`), custo gravado 3,34, exigível 23,38 | **Divergência falsa.** O import arredonda o custo unitário para 2 casas (`ROUND(v_custo_unit, 2)`), e o erro vai para a obrigação |
| T2 — recebimento parcial 6/10 com duplicata do documento (100) | Recusado, sem AP | Não há redução implícita da obrigação |
| T3 — parcial 6/10 com duplicata igual ao conferido (60) | Aceito, AP 1 de 60,00 | Redução só ocorre por ato explícito do operador, na duplicata |
| T4 — duplicatas 50 + 50 com exigível 100 | Aceito, AP 2 de 100,00 | Caso válido |

**Tolerância de R$ 0,01: justificativa e limite.** O valor 0,01 cobre o arredondamento do total em centavos, mas não o erro de custo unitário. O custo gravado tem erro de até 0,005 por unidade, portanto até 0,005 × quantidade por item. Para 7 unidades, o erro pode chegar a 0,035, que o T1 ilustra. Com a tolerância fixa, o sistema rejeita NFs legítimas com quantidade ≥ 2 quando o custo tem mais de 2 casas. Recomendação: (a) corrigir a precisão do custo (6 casas, item de precisão do backlog), que elimina a causa; ou (b) enquanto isso, tolerância = 0,01 + Σ(0,005 × quantidade conferida). A opção (b) precisa de aprovação, porque altera a regra.

**Adiantamentos e pagamentos antecipados:** não suportados (não implementado, conforme pedido). Não existe campo de adiantamento na importação.

**Recebimento parcial:** nenhuma quitação ou redução automática (T2). A obrigação só muda por duplicata informada explicitamente (T3).

---

## 2. Estado das migrations (Decisão 2)

Medido por leitura (sem aplicar nada):

| Ambiente | Função `internal.confirmar_importacao_nfe(uuid)` | Registro S2 | Registro da conciliação |
|---|---|---|---|
| Produção (`kbabmewnahysfvlybiak`) | md5 `b0c97f71…`, 6986 caracteres. Tem S2 (`v_consumido`), **sem** conciliação | `20261029202813` `s2_nfe_vinculada_oc_sem_dupla_creditacao` | — |
| Homologação (`yvdilcmxyjafnnsfdtam`) | md5 `464587b0…`, 7646 caracteres. Tem S2 **e** conciliação | `20261029181913` `reaplica_s2_versao_final` (após rollback/reaplicação); `20261030002520` é outra mudança de outra sessão | **não registrada** (aplicada por `execute_sql`) |

**Verificação de equivalência:** removendo do texto de homologação os dois trechos inseridos pela conciliação, o md5 resultante é `b0c97f714053e58047da02f6ed67f02a`, **idêntico à produção**. Logo, a única diferença de conteúdo entre homologação e produção nessa função é a conciliação.

**Diferença não verificada:** o arquivo versionado `20261029160000_s2_…sql` não foi comparado byte a byte com a produção. Prova sugerida: aplicar o arquivo numa base descartável e comparar o md5 (depende da infraestrutura da Decisão 4).

**Drift no repositório:** S2 está em produção como `20261029202813`, mas no repositório como `20261029160000`. O nome é o mesmo; a versão difere.

**Estratégia de regularização (proposta, não executada):**
1. **Não reaplicar** a função em homologação: o conteúdo já é o esperado.
2. Verificar de novo o md5 sem conciliação (passo acima), imediatamente antes do registro.
3. Registrar a versão em homologação com uma linha em `supabase_migrations.schema_migrations`, `version = '20261030120000'`, `name = 'nfe_conciliacao_duplicatas'`. Isso é um `INSERT` em tabela de controle, sem alterar função.
4. Não remover as versões `rollback_*` e `reaplica_*` de homologação: são histórico.
5. Em produção, a conciliação ainda não existe. Ela entra pelo caminho normal de migration, somente após aprovação de merge e janela de deploy, com o rollback `backend/supabase/rollback/20261030120000_nfe_conciliacao_duplicatas_rollback.sql`.
6. Alinhar a versão de S2 (repositório `20261029160000` × produção `20261029202813`), renomeando o arquivo ou registrando o alias, sob decisão do dono.

---

## 3. Testes SQL de NF-e (Decisão 3)

| Script | Estado |
|---|---|
| `nfe-conferencia-flx05-ui.test.sql` | **Corrigido e executado** (passos 1–5 PASSOU em homologação, rollback). Passo 6 (NaN/Infinity) **não executado**; passo 7 (isolamento) coberto só parcialmente pelos casos C1/C2 de sessão anterior; passo 8 é estático e não foi executado |
| `nfe-conciliacao-exigivel.test.sql` | **Novo. Executado**: T1 limite documentado, T2, T3, T4 PASSOU |
| Demais 11 scripts (`nfe-conferencia-margem-nao-bloqueia-estoque`, `nfe-duplicata-invalida-aborta`, `nfe-manual-sem-cnpj`, `ux04-oc-recebimento-parcial`, `d0-remessa-conferencia-columns-drift`, `test-nfe-conferencia-concurrency.mjs`, `nfe-conferencia-margem-contract.test.mjs`, `entrada-documento-posterior.test.mjs`, e as variações) | **NÃO EXECUTADOS.** Não atualizados para multiempresa nesta entrega |

**Isolamento executado** (homologação, rollback): gerente da empresa 2 conferindo e confirmando NF da loja A recebe `ACESSO_LOJA_NEGADO` nos dois casos. Os testes do repositório esperavam outro código; o FLX05 já foi alinhado.

**Honestidade sobre a Decisão 3:** a recuperação dos 13 scripts não está completa. Faltam 11 scripts. Não considere a suíte recuperada.

---

## 4. Concorrência real (Decisão 4)

**Bloqueada pela infraestrutura.**
- Docker Desktop está instalado (`docker.exe`), mas o daemon não está em execução (`docker info` falha).
- Supabase CLI está instalado, mas `supabase start` exige Docker.
- Não há PostgreSQL local. Não há `psql`.
- O MCP do Supabase usa uma conexão única e não permite duas sessões concorrentes reais.

**Direção pedida:** iniciar o Docker Desktop neste host e rodar `supabase start` num projeto local descartável, ou autorizar outro banco local descartável. Ambos são sem custo. Não instalei nada.

---

## 5. Diagnóstico de duplicidades financeiras (Decisão 5, produção, somente leitura)

**Identidade confirmada:** `get_project` retornou `jinlong`, ref `kbabmewnahysfvlybiak`, host `db.kbabmewnahysfvlybiak.supabase.co`. Todas as consultas foram `SELECT` dentro de `BEGIN READ ONLY`, com `ROLLBACK`, sem locks explícitos, sem funções com efeito colateral e apenas contagens.

| Medida | Resultado |
|---|---|
| NFs importadas / concluídas | 6 / 6 |
| Contas a pagar de origem NF-e | 9 (6 NFs) |
| Coluna `importacao_duplicata_id` em `contas_pagar` | **Não existe** |
| Parcelas NF-e sem `parcela` | 9 de 9 |
| AP canceladas | 0 |
| Grupos de AP com mesma (NF, vencimento, valor) | **0** |
| NFs com quantidade de AP diferente das duplicatas | **0** |
| NFs com soma das AP diferente das duplicatas | **0** |
| Duplicatas com número repetido na mesma NF | **0** |
| NFs concluídas sem AP | **0** |
| NFs fora da regra do exigível conferido (> 0,01) | **0** |
| NFs com soma das duplicatas diferente do valor do documento | **0** |

**Leitura:** em produção, não há duplicidade de obrigações de NF-e. A amostra é pequena (6 NFs). Não há evidência de que o problema tenha ocorrido, mas também não há prova de que nunca ocorra.

**Sobre `importacao_duplicata_id`:** não existe hoje. Seria a identidade estável da obrigação: uma coluna em `contas_pagar` referenciando `importacoes_nfe_duplicatas.id`, com `UNIQUE` parcial `WHERE importacao_duplicata_id IS NOT NULL`. Impacto: as 9 linhas existentes precisariam de backfill por correspondência de ordem (`numero_duplicata` não está em `contas_pagar`). Funções que leem `contas_pagar` (pagamento, relatórios, ledger) não usam essa coluna, então não quebram. **Nenhuma UNIQUE foi criada.** Recomendação: adicionar a coluna nullable e o backfill numa migration separada, e só então a constraint, após nova consulta de duplicidade.

---

## 6. Diff e commits

Commits desta sessão (branch `claude/jinlong-cost-profitability-integration-5b886c`, sem push):
- `81daca66` — `fix(nfe): conciliação de duplicatas na confirmação da NF-e` (migration `20261030120000` e rollback)
- `43ad55fc` — `test(nfe): atualiza FLX05 para multiempresa e conciliação`

Ainda não commitados (aguardam aprovação): `backend/scripts/nfe-conciliacao-exigivel.test.sql` e este relatório. Também há documentos de auditoria de sessões anteriores não commitados.

---

## 7. Riscos residuais

1. **Divergência falsa por arredondamento de custo (T1)** bloqueia NFs legítimas. Risco operacional alto para NFs com quantidade ≥ 2 e custo com mais de 2 casas.
2. **Homologação fora do histórico de migrations** até a regularização.
3. **Produção sem a conciliação**: a correção só vale após deploy.
4. **11 scripts de NF-e não recuperados.** A suíte não é evidência de nada.
5. **Concorrência não testada.** A garantia depende do `FOR UPDATE` estático.
6. **Amostra de produção pequena** (6 NFs).
7. **Versão de S2 divergente** entre repositório e produção.

---

## 8. Plano de rollback e recomendação

**Rollback:** `backend/supabase/rollback/20261030120000_nfe_conciliacao_duplicatas_rollback.sql`. Restaura a definição sem a conciliação, com o mesmo padrão de substituição exata, e falha se o trecho não existir uma vez. Em homologação, executar o rollback e depois remover o registro de `schema_migrations` se a regularização tiver sido feita.

**Recomendação de merge:** **não recomendo ainda.** Condições: (1) decisão sobre a tolerância (correção de precisão ou tolerância proporcional); (2) recuperação dos 11 scripts restantes; (3) prova de concorrência; (4) regularização do registro em homologação; (5) decisão sobre a versão de S2.

---

## 9. Atualização (2026-10-30, rodada 2)

### 9.1 Origem do caso 7 × 3,335 (investigada antes da alteração de esquema)

- NF-e: `vUnCom = 3,335` (até 10 casas), `vProd = 23,35` (2 casas, emitido como `ROUND(7 × 3,335, 2)` = `ROUND(23,345, 2)`).
- Import (`importar_nfe_transacao`): `custo_unitario = ROUND(vUnCom / fator, 2) = 3,34`. Arredondamento **antes** de multiplicar pela quantidade.
- Conciliação anterior: `7 × 3,34 = 23,38` ≠ duplicata `23,35` ⇒ recusa. **Divergência artificial**, nascida do custo arredondado.
- Parser: não lia `vProd`. O total documental não estava disponível para comparação.

### 9.2 Precisão monetária (campos distintos)

| Campo | Precisão | Origem |
|---|---|---|
| Custo unitário gravado (`custo_unitario`) | `numeric(10,2)` (inalterado) | `ROUND(vUnCom / fator, 2)`; usado só como fallback legado |
| Custo unitário documental (`valor_unitario_documento`) | `numeric(18,10)` | `vUnCom` exato, novo |
| Quantidade (`quantidade_nfe`, `quantidade_conferida`) | `numeric(10,3)` (inalterado) | limite: `qCom` com mais de 3 casas é truncado no import (registrado como risco) |
| Fator de conversão (`fator_conversao`) | `numeric(18,6)` | novo |
| Total do item documental (`valor_total_documento`) | `numeric(14,2)` | `vProd` informado pela NF-e, novo |
| Total exigível | calculado na confirmação, não gravado | regra abaixo |
| Soma das duplicatas | `numeric(14,2)` | inalterado |

**Regra do exigível por item** (`internal.confirmar_importacao_nfe`, migration `20261030130000`):
1. Quantidade conferida = quantidade da NF **e** `vProd` informado ⇒ usa `vProd` (valor documental, não recalculado).
2. `valor_unitario_documento` informado ⇒ `ROUND(qtd_conferida / fator × vUnCom, 2)`.
3. Sem dado documental (itens anteriores à migration) ⇒ `ROUND(qtd_conferida × custo_unitario, 2)` (legado).

Arredondamento: `ROUND(numeric, 2)`, o mesmo de `public.round_abnt`. Tolerância de R$ 0,01 aplicada **uma vez, ao total** (D3).

### 9.3 Testes (local, `backend/scripts/nfe-precisao-documental.test.sql`)

| Caso | Resultado |
|---|---|
| P1 — 7 × 3,335, vProd 23,35, duplicata 23,35 | PASSOU (sem divergência artificial) |
| P2 — mesma NF, duplicata 23,38 (valor do custo gravado) | PASSOU (recusada: divergência real frente ao documento) |
| P3 — parcial 6/7, duplicata 20,01 | PASSOU (regra por unidade) |
| P4 — parcial, duplicata 23,35 (documento inteiro) | PASSOU (recusada, sem quitação implícita) |
| P5 — fator 12, 24 unidades, vProd 72,00 | PASSOU |
| P6 — fator 12, parcial 20 unidades | PASSOU (60,00) |
| P7 — legado sem dado documental | PASSOU (23,38, regra c) |
| P8 — diferença de 0,02 | PASSOU (recusada; tolerância 0,01) |

Rollback (`backend/supabase/rollback/20261030130000_nfe_precisao_documental_rollback.sql`) verificado localmente: após o rollback, P1 falha como esperado; após reaplicar, 8/8 voltam a passar.

### 9.4 Testes de recuperação (ambiente local, Supabase CLI em Docker)

| Script | Resultado local |
|---|---|
| `nfe-conferencia-flx05-ui.test.sql` (passos 1–8) | PASSOU |
| `nfe-conferencia-margem-nao-bloqueia-estoque.test.sql` | PASSOU |
| `nfe-duplicata-invalida-aborta.test.sql` | PASSOU |
| `nfe-manual-sem-cnpj.test.sql` | PASSOU |
| `ux04-oc-recebimento-parcial.test.sql` (14 verificações) | PASSOU |
| `d0-remessa-conferencia-columns-drift.test.sql` | PASSOU |
| `ux04-oc-recebimento-concorrencia.sh` (concorrência de OC, 4 cenários) | PASSOU |
| `test-nfe-conferencia-concurrency.mjs` (2 sessões, contenção de lock) | PASSOU (2/2) |
| `nfe-conferencia-margem-contract.test.mjs` (PGlite) | PASSOU |
| `entrada-documento-posterior.test.mjs` (PGlite) | PASSOU |
| `nfe-conciliacao-exigivel.test.sql` | PASSOU (4/4) |
| `nfe-precisao-documental.test.sql` | PASSOU (8/8) |
| `nfe-concorrencia-confirmacao.sh` (2 sessões, mesma NF) | PASSOU |

Ajustes feitos nos scripts: `empresa_id` em lojas e categorias (multiempresa); duplicata padrão do `ux04` = exigível do conferido; assinatura atual de `criar_confirmar_remessa_entrada` (6 argumentos); produto/gerente fixos da fixture no `d0`. **Nenhuma** RLS, trigger, constraint ou validação foi enfraquecida.

### 9.5 Concorrência real

- Duas sessões psql independentes, mesma NF-e, banco local: uma confirmação efetiva; a outra recebe `IMPORT_NFE_STATUS_INVALIDO` depois de esperar o lock. Estoque +10 (uma vez), kardex 1 linha, AP 1 de 100,00, status `CONCLUIDA`.
- **Resíduo conhecido:** o script de concorrência comita a NF-e de teste. Não é removível, porque `movimentos_estoque_log` é imutável por trigger. Aceito apenas no banco local descartável; limpeza com `supabase db reset`.
- Controle negativo (mostrar duplicação sem `FOR UPDATE`) **não executado**.

### 9.6 Estado das migrations (Decisão 2, complementado)

- **Repositório não reproduzível do zero em ambiente local:**
  1. Versão duplicada `20261023130000` (`growth001_central_conversao` e `movimentos_estoque_log_transferencia_id`). O `supabase db reset` falha nela.
  2. `20261029150000_g14_…` tem auto-verificação (`G14: movimento de entrada do destino encontrado 0 vezes`) que falha em base vazia. Não aplicada localmente; o trecho de transferência ficou sem G14 no banco local.
- **Homologação:** continua com a conciliação v1 (`20261030120000`) aplicada fora do histórico. A `20261030130000` **não** foi aplicada em homologação nem em produção.
- **Produção:** sem conciliação nem precisão documental.

### 9.7 O que não foi feito nesta rodada

- Não iniciei o motor de custo médio.
- Não fiz merge, deploy ou alteração em produção.
- Não rodei `tsc`/vitest do front-end (`pdv-importados`): dependências não instaladas. A alteração TS (parser, `actions.ts`, página) está **não testada** por compilação.
- Diagnóstico de produção (rodada anterior) continua válido; a regra nova não foi consultada contra dados de produção.
- Ainda não há teste de idempotência por UNIQUE; a decisão sobre `importacao_duplicata_id` segue pendente.

### 9.8 Passos 1, 2 e 3 (executados após aprovação)

**Passo 1 — front-end.** `npm ci` em `pdv-importados` e `tsc --noEmit -p tsconfig.typecheck.json` falhou em 2 pontos da minha alteração (campo `v_prod` ausente nos schemas zod). Corrigido em `be9d3290`. Depois: typecheck sem erros; vitest do módulo de importação NF-e: 24 arquivos e 160 testes passando (2 pulados, como no baseline).

**Passo 2a — versão duplicada.** `20261023130000` tinha dois arquivos de funcionalidades distintas (Central de Conversão, growth-001, e `transferencia_id`, #629). Verificado que nenhum ambiente registra a versão: produção não tem a coluna `transferencia_id` nem `commercial_planos`; homologação e local também não. Renomeada a growth-001 para `20261023130100` (commit `256a7a8e`, com referências em `hub/`). Duplicidade no repositório: zero.

**Passo 2b — homologação.**
- Pré-condição: `confirmar_importacao_nfe` tinha md5 `464587b0…` (a conciliação v1). Registrada a versão `20261030120000` em `supabase_migrations.schema_migrations` (sem reexecutar a função).
- Aplicada a `20261030130000` em homologação, em transação, com as mesmas substituições textuais testadas localmente. Colunas e constraints criadas, funções atualizadas, prova interna OK. Registrada a versão `20261030130000`.
- Ressalva: o corpo aplicado foi o executável do arquivo; os comentários de cabeçalho não foram enviados (não alteram a execução).

**Passo 3 — suíte em homologação (rollback, sem resíduo).** Executada via `supabase db query --linked -f` (após `supabase link` explícito ao projeto de homologação e `unlink` ao final). Controle negativo confirmou que erros aparecem.

| Script | Homologação |
|---|---|
| `nfe-conferencia-flx05-ui` | PASSOU (sem erro) |
| `nfe-conferencia-margem-nao-bloqueia-estoque` | PASSOU |
| `nfe-duplicata-invalida-aborta` | PASSOU |
| `nfe-manual-sem-cnpj` | PASSOU |
| `ux04-oc-recebimento-parcial` | PASSOU |
| `nfe-conciliacao-exigivel` | PASSOU |
| `nfe-precisao-documental` (8 casos) | PASSOU |
| `d0-remessa-conferencia-columns-drift` | **NÃO EXECUTADO em homologação**: altera estrutura (DROP COLUMN) dentro de transação, e não foi possível confirmar que a API não confirmaria o DDL. Passou localmente |
| `ux04-oc-recebimento-concorrencia.sh`, `test-nfe-conferencia-concurrency.mjs`, `nfe-concorrencia-confirmacao.sh` | **NÃO EXECUTADOS em homologação**: comitam dados. Decisão 4 veda resíduos no banco compartilhado. Passaram localmente |
| `nfe-conferencia-margem-contract.test.mjs`, `entrada-documento-posterior.test.mjs` | Sem banco (PGlite); passaram localmente |

**Resíduos.** Depois da suíte: NFs sintéticas 0, AP de teste 0, produtos e lojas de teste 0, `movimentos_estoque_log` = 51 (igual ao início), coluna `conferido_por` intacta, `valor_total_documento` presente.
