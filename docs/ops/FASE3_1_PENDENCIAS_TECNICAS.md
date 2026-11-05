# Fase 3.1 — Pendências técnicas (2026-11-05)

**Escopo:** investigação e testes locais. **Nada foi aplicado em produção nem em homologação remota**, não houve `db push`, `migration repair`, alteração do manifesto ou do gate, merge, deploy ou push.

**Ambiente de teste:** stack Supabase local do repositório (`supabase_db_fastproduct`, PostgreSQL 17), que já tem as 11 migrations aplicadas. **Ele não é um espelho exato de produção**: a função interna `internal.transferir_estoque_seguro` tem definição diferente da produção (md5 local `01f6…`, produção `c095…`). Todo teste que depende de definição exata deve ser refeito contra um snapshot de produção.

Os testes rodaram dentro de transações com `ROLLBACK`. Nenhuma linha persistiu.

---

## 1. Migration 121000 — provisionamento de empresas

### 1.1 Implementação atual

- **Núcleo:** `public.plataforma_provisionar_empresa(jsonb, uuid)` (migration `20261019120000`, depois movida para `internal.plataforma_provisionar_empresa_nucleo` pela 121000). É uma função PL/pgSQL, `SECURITY DEFINER`, executada em **uma única transação**: qualquer `RAISE EXCEPTION` desfaz tudo que ela gravou.
- **Etapas:** valida payload → insere `empresas` → insere `lojas` (código global com sufixo se colidir) → para cada usuário: valida papel, valida loja, recusa usuário com vínculo ativo em outra empresa ou perfil `ADMIN`, faz `INSERT … ON CONFLICT (id) DO UPDATE` em `usuarios` → `usuario_vinculos` (criado por trigger e, para `GERENTE` multi-loja, pelo próprio núcleo) → exige pelo menos um `DONO`.
- **Permissões:** `EXECUTE` só para `service_role`. Nenhum `anon`/`authenticated`.
- **Trial:** `plataforma_iniciar_trial` chama a função pública. Ela já exige que o usuário **não exista** (`TRIAL_USUARIO_JA_EXISTE`), então o trial nunca reaproveita usuário.

### 1.2 Compatibilidade com a 121000

A 121000 renomeia o núcleo, grava `public.plataforma_provisionar_empresa` como porta fail-closed (interruptor `saas.parametros.provisionamento_automatico` ou contingência com `fp.provisionamento_contingencia` e `fp.provisionamento_responsavel` na sessão) e registra a trilha em `internal.provisionamento_contingencia_log`. O corpo do núcleo não muda.

- **Compatível** com o núcleo atual.
- **Efeito direto:** com a 121000 aplicada, `plataforma_iniciar_trial` fica bloqueado pelo mesmo interruptor (é o comportamento pretendido).
- **Conflito de produto:** o runbook `TESTE_CONTROLADO_PROVISIONAMENTO_PRODUCAO` prevê provisionamento em produção, que só passa com contingência autorizada.

### 1.3 Testes existentes

`backend/scripts/provisionamento-wizard-trial.test.sql` (contrato 121000, cenários A–E): **passou** no banco local.

| Cenário | Resultado |
|---|---|
| A. automático bloqueado, nada gravado | OK |
| B. contingência sem responsável recusada | OK |
| C. contingência autorizada cadastra empresa, loja, 3 vínculos, trilha | OK |
| D. trial bloqueado pelo mesmo interruptor | OK |
| E. RPCs de plataforma só para `service_role` | OK |

### 1.4 Teste controlado de atomicidade (novo)

Arquivo: `backend/scripts/provisionamento-atomicidade.test.sql`. Cada cenário força uma falha em um ponto do fluxo e confere **zero resíduo** (empresas, lojas, usuários, vínculos e trilha iguais antes e depois).

| Caso | Falha forçada | Resultado com a função atual |
|---|---|---|
| C1 | segundo usuário com papel `ADMIN` | OK (nada gravado) |
| C2 | `OPERADOR` com duas lojas | OK |
| C3 | lote sem `DONO` (falha no fim) | OK |
| C4 | caminho feliz | OK (empresa, loja, DONO e vínculo gravados) |
| C5 | usuário com vínculo **ativo** em outra empresa | OK |
| **C6** | usuário **existente, ativo, sem vínculo ativo** em outra empresa | **FALHA** (ver 1.5) |
| C7 | loja desconhecida no último passo | OK (nada gravado) |

**Resultado: 6 de 7.** Os casos C1 a C5 e C7 mostram que a função é atômica para as falhas testadas: nenhuma empresa parcial.

### 1.5 Achado: reatribuição silenciosa de usuário existente

**Causa:** a checagem de "usuário já vinculado a outra empresa" só olha `usuario_vinculos` com `ativo = true`. Se o usuário existe em `usuarios` com `ativo = true`, mas o vínculo na empresa anterior está inativo, a checagem passa. Em seguida o `ON CONFLICT (id) DO UPDATE` **reescreve `perfil`, `loja_id` e `ativo`** e o usuário passa para a nova empresa.

**Impacto:** operação executada com `service_role` (plataforma), mas que altera permissões de um usuário real sem consentimento e sem vínculo na empresa de origem. Viola o critério "nenhuma empresa criada com permissões incorretas".

**Coerência com as regras existentes:** `plataforma_iniciar_trial` já recusa usuário existente (`TRIAL_USUARIO_JA_EXISTE`). O provisionamento de wizard deveria seguir a mesma regra.

### 1.6 Correção proposta (testada localmente, não aplicada)

Arquivo: `backend/scripts/fase31-propostas/provisionamento_nucleo_nao_reatribui_usuario.sql` (proposta, fora de `migrations/`; não executar fora de teste).

Mudança: antes de qualquer `INSERT` em `usuarios`, recusar se o `id` **já existe** em `usuarios`, com a exceção `PROVISIONAR_USUARIO_JA_EXISTENTE`. A checagem de vínculo ativo em outra empresa e a de `ADMIN` continuam.

**Teste local (em transação, com `ROLLBACK`):**

| Verificação | Resultado |
|---|---|
| Suíte de atomicidade (C1–C7) com a correção | **7 de 7 OK** |
| Função em produção local após o teste (sem a correção) | original preservada (`f`) |
| Teste de regressão `provisionamento-wizard-trial.test.sql` com a correção | **OK** (A–E) |

**Status:** rascunho pronto e testado localmente. Não está em migration nem aplicado.

**Efeito no fluxo:** o wizard passa a exigir usuários novos. Usuário existente entra por `vincular_usuario_loja`, que já é o caminho próprio para isso.

### 1.7 Comportamento quando uma etapa falha

- **Dentro da função:** tudo-ou-nada. Qualquer `RAISE` desfaz empresa, lojas, usuários e vínculos (comprovado por C1, C2, C3, C7).
- **Fora da função:** cada chamada é uma transação. Não há etapa separada no app que possa deixar lixo, desde que a ação continue chamando **uma** RPC. Não foi verificado o código de `pdv-importados/app/admin/provisionamento/` linha a linha; a afirmação vale para o contrato da RPC.
- **Efeitos de triggers:** o wizard test mostra que o cadastro também cria `pdv_config`, formas de pagamento e checklist. Esses efeitos fazem parte da mesma transação.

### 1.8 Pendências do proprietário

- Decidir se o provisionamento em produção continua pelo teste controlado (contingência) ou só pelo hub comercial.
- Aprovar a correção do 1.6 antes da 121000 entrar.

---

## 2. Migration 101000 — cobrança

Análise completa em `FASE3_1_PLANO_LIBERACAO.md`, seção 2. Resumo dos fatos verificados:

- **RPCs de cobrança:** `cobranca_registrar_assinatura`, `cobranca_reservar_assinar` / `cobranca_liberar_assinar` (lock de 120 s por empresa), `cobranca_processar_vencimentos` (trial vencido → `SUSPENSA`; inadimplente após carência com fatura `VENCIDA`), `cobranca_aplicar_evento` (webhook Asaas), `cobranca_conciliar_pagamento`, `cobranca_cancelar`, `cobranca_suspender`, `cobranca_liberar_venda_offline`.
- **Idempotência do webhook:** `saas.webhook_eventos` tem chave em `evento_id`; reenvio devolve o resultado gravado.
- **Estados:** `TRIAL`, `ATIVA`, `INADIMPLENTE`, `SUSPENSA`, `CANCELADA`; fatura `PENDENTE`/`VENCIDA`; upgrade fica em `*_pendente` até o pagamento.
- **Página do DONO:** `gateDono` chama `fp_sou_dono_da_empresa`, que **não existe em produção**. Resultado: o DONO vê a própria assinatura (`fp_minha_assinatura` existe), mas `podeGerenciar` é `false` e qualquer ação responde "Somente o DONO gerencia a assinatura". A mensagem é falsa para um DONO real.
- **Contratação com autoatendimento desligado (padrão):** o caminho é `commercial_solicitar_contratacao`, que **não existe em produção** (definida em GROWTH-001, adiada no manifesto). Ou seja, **hoje não há caminho de contratação funcionando em produção**.

**Não rodado:** `backend/scripts/cobranca-planos-trial.test.mjs` (595 linhas) depende de ambiente Node/Supabase que não foi configurado nesta etapa. Fica como pendência.

---

## 3. Migration 1030100000 — vendas offline com desconto

### 3.1 Sintoma

Venda feita no PDV em modo offline, com desconto de gerente, é recusada no `sync-outbox` com `GERENTE_TOKEN_INVALIDO_OU_REVOGADO`.

### 3.2 Causa-raiz: duas camadas

1. **Função ausente em produção.** `sync-outbox/index.ts` (linhas 757–765), em modo dispositivo com desconto, chama `fp_token_gerente_vale_na_loja`. Essa RPC **não existe em produção** (definida em `20261028120100`, pendente). A chamada retorna erro e o código recusa a venda. **Esta é a causa operacional imediata.**
2. **Regra incorreta mesmo após a 120100.** O token emitido pelo dispositivo grava `criado_por = NULL` (`validar-gerente`, `tokenCreatedBy: null`). A regra antiga de `internal.token_gerente_fora_da_loja` trata "emissor ausente" como **fora da loja**. Mesmo com a função presente, o token do dispositivo seria recusado. A 1030100000 corrige isso: emissor ausente só vale se o token for da loja consultada **e** o aprovador estiver ativo e vinculado à empresa da loja.

### 3.3 O que o servidor já valida na reconciliação

Verificado na definição de `registrar_venda_com_itens` (ambiente local):

- Recalcula totais (`internal.calcular_totais_venda`) e recusa divergência (`ERRO_RPC_TOTAIS_DIVERGENTES`).
- Valida cada preço (`internal.validar_precos_venda`): acréscimo proibido, produto da loja, preço dentro da faixa e acima da tabela recusados.
- Desconto global do gerente deve ser igual ao recalculado (`ERRO_RPC_DESCONTO_GERENTE_DIVERGENTE`).
- Desconto manual por item: trigger `trg_itens_venda_limite_desconto_bi` em `itens_venda` (`DESCONTO_MANUAL_EXCESSIVO`, teto padrão de 15%). Vale para o caminho offline também.
- Idempotência por `venda_id`: repetição com o mesmo payload é aceita; payload diferente gera `ERRO_RPC_RETRY_PAYLOAD_DIVERGENTE`. Pagamentos também têm assinatura comparada.
- Soma dos pagamentos deve bater com o total líquido.

**Conclusão:** o servidor já recalcula preço e desconto, e a manipulação de payload é detectada. Não é preciso mudar isso.

### 3.4 Lacuna encontrada: o token não é consumido no offline

- A RPC de reconciliação não referencia `tokens_desconto_gerente` (0 ocorrências na definição).
- `sync-outbox` não marca o token como usado.
- Efeito: **um mesmo token de gerente pode autorizar várias vendas offline** enquanto estiver válido (não revogado). O token é de uso único no desenho original (`usado`).
- O caminho online também consome o token, mas em outra função. Não foi rastreado por completo nesta etapa.

### 3.5 Solução proposta

1. **Imediato (sem migration nova):** aplicar a 120100 e a 1030100000 em homologação, com o teste de venda offline com token de dispositivo (aceita) e token com aprovador inativo (recusa).
2. **Rascunho pronto e testado (`backend/scripts/fase31-propostas/token_desconto_consumo_unico_offline.sql`, testes T1–T9 OK em `fase31-token-consumo-unico.test.sql`); integração pendente.** Conteúdo: tabela de consumo por `(token, venda_id)` e função `internal.consumir_token_desconto_venda`, que, dentro de RPC de reconciliação, para venda com desconto de gerente:
   - exigir `desconto_gerente_token`;
   - consumir o token de forma atômica (`usado = true`, `usado_em`, `venda_id`) com `WHERE usado = false`;
   - se o mesmo `venda_id` já consumiu o token, aceitar (**idempotência de retry**); se outro `venda_id` tentar, recusar `TOKEN_GERENTE_JA_USADO`;
   - manter todas as validações atuais de preço, total e desconto.
3. **Testes (feitos, transação com ROLLBACK):** token usado por uma venda não serve a outra (T3); repetição da mesma venda é aceita sem duplicar (T2, T9); revogado, expirado, de outra loja e inexistente são recusados (T4–T7); aprovador inativo recusado porque o token é revogado ao inativar o usuário (T8). **Integrado (local):** `public.registrar_venda_offline_com_token` (`backend/scripts/fase31-propostas/registrar_venda_offline_com_token.sql`) faz o consumo e a gravação da venda numa única transação. Testes R1–R4 com venda real OK (`backend/scripts/fase31-registrar-venda-token.test.sql`): venda gravada e token consumido; retry da mesma venda sem duplicar; segunda venda recusada e não gravada; falha na venda desfaz o consumo. `sync-outbox/index.ts` chama o wrapper para dispositivo com token; `deno check` OK e 23 testes existentes passam. **Pendente:** payload alterado, e a migration precisa ser revisada antes de entrar.
4. **Política de validade:** o token offline deve ter validade curta. A checagem existe em `validar_gerente`; confirmar o valor.

### 3.6 Pendências

- Decidir a janela de validade do token offline (produto).
- Escrever e testar a migration do item 3.5.2 antes de liberar o PDV offline com desconto.

---

## 4. Migration 1029155000 — kardex (`transferencia_id`)

### 4.1 Estrutura alterada

- `ALTER TABLE public.movimentos_estoque_log ADD COLUMN transferencia_id uuid NULL`.
- Índice `idx_movimentos_estoque_log_transferencia_id`.
- Reescrita de `internal.transferir_estoque_seguro` **por substituição de texto** (`regexp_replace` sobre `pg_get_functiondef`). A migration **não contém um `CREATE` completo**. Se o texto não bater, ela lança `drift, ajuste manual necessário`.

### 4.2 Dados afetados

| Local | Produção (somente leitura) |
|---|---|
| 33 linhas em `movimentos_estoque_log`, 0 com `transferencia_id` | 75 linhas, **0 transferências** (`TRANSFERENCIA_*`), última em 2026-10-28 |

Hoje não há dado a perder. O risco é futuro: a partir da aplicação, cada transferência grava o vínculo.

### 4.3 Dependências e compatibilidade

- **Código do app:** nenhuma referência a `transferencia_id` fora de tipos gerados. Remover a coluna não quebra o app.
- **Kardex é append-only:** triggers `trg_movimentos_estoque_log_bloqueia_mutacao` e `…_bloqueia_truncate`. Não é possível limpar valores com `UPDATE`.
- **Função:** o wrapper público `public.transferir_estoque_seguro` tem o mesmo md5 em produção e no local. A interna **não tem**.
- **Tabela de idempotência** `transferencias_idempotencia.transferencia_id` aponta só para a SAÍDA. Não é afetada.

### 4.4 Por que "executa sem erro" não basta para o rollback

1. **O rollback precisa restaurar o corpo exato de produção.** O repositório não tem um `CREATE` standalone do corpo anterior; ele é resultado de uma cadeia de patches. Um rollback recriado a partir de arquivos pode diferir da produção sem erro de SQL.
2. **`DROP COLUMN` é irreversível.** Todos os vínculos gravados enquanto a migration estava ativa seriam perdidos. O vínculo só é reconstruível pelo par saída/entrada, e a reconstrução é frágil (exatamente o problema que a #586 resolve).
3. **Não existe arquivo de rollback no repositório** para `20261029155000`. O registro do changelog citava `ops/`, que não existe. Pendência real.

### 4.5 Proposta de rollback

**Rollback não destrutivo (recomendado):**
1. Antes de aplicar a 155000: capturar `pg_get_functiondef` de `internal.transferir_estoque_seguro` em produção, salvar em arquivo e registrar o md5. Esse é o corpo-alvo do rollback.
2. Rollback: restaurar **somente o corpo** (sem `transferencia_id` nos `INSERT`), verificando md5 antes e depois. **Manter a coluna** (nullable, sem efeito). Nenhum dado é perdido.
3. Teste: transferência com saldo, idempotência por chave e autorização continuam funcionando; o vínculo não é gravado.

**Rollback destrutivo (só depois, se necessário):** exportar `(id, transferencia_id)` para tabela de backup, confirmar que nenhum objeto depende da coluna, e só então `DROP INDEX` e `DROP COLUMN`.

**Não testado nesta etapa:** o rollback proposto não foi executado. Pendente: executar contra snapshot de produção.

---

## 5. Migrations fiscais — NF-e de entrada

### 5.1 Defeito: NF de R$ 100 com duplicata de R$ 60

- **RPC responsável:** `internal.confirmar_importacao_nfe(uuid)`.
- **Causa-raiz:** a versão **em produção** só verifica que existe ao menos uma duplicata (`IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA`). **Não compara a soma das duplicatas com o valor econômico da NF.**
- **Regra financeira incorreta:** a conta a pagar é criada **a partir das duplicatas**, uma por parcela (`INSERT INTO contas_pagar … FROM importacoes_nfe_duplicatas`). Nada reconcilia com o valor da NF. A duplicata passa a ser a fonte da verdade, quando deveria ser conferida contra o documento.
- **Correção existente:** `20261030120000` acrescenta a comparação com tolerância de R$ 0,01 e erro `IMPORT_NFE_DUPLICATAS_DIVERGENTES`. **Já está no ambiente local**, não está em produção.

**Reprodução:** pela definição (não executada): sem a checagem de soma, uma NF de 100 com duplicata de 60 passa e gera AP de 60. A checagem de obrigação só exige que exista ao menos uma duplicata.

### 5.2 Impacto nos registros existentes (produção, somente leitura)

| Verificação | Resultado |
|---|---|
| NF-e com duplicatas | 6 |
| Contas a pagar de origem NF-e | 9 parcelas, todas batem com a soma das duplicatas da NF |
| NF-e com duplicata fora da tolerância em relação ao valor econômico (`quantidade_conferida × custo_unitario`) | **0** |
| Duplicatas de valor zero | 0 |

**Conclusão:** o defeito é **latente**. Os dados atuais estão consistentes. Ele aparecerá na próxima confirmação com divergência.

### 5.3 As seis NF-e não finalizadas

- As seis estão com status `CONCLUIDA` (não `CONFIRMADA` nem `CANCELADA`) e todas têm duplicatas.
- Todas batem com o valor econômico dentro de R$ 0,01.
- **Não foi alterado nenhum documento fiscal.** Confirmar uma delas hoje geraria AP correto, mas a confirmação não tem a proteção que a 120000 traria.
- Recomendação: confirmar ou cancelar pelo fluxo normal, somente após a 120000 estar em produção.

### 5.4 Correção mínima e dependências

- **120000** (soma com tolerância): correção mínima do defeito financeiro. Depende da suíte de NF-e funcionar.
- **130000** e **140000**: exigem colunas `valor_unitario_documento`, `valor_total_documento`, `fator_conversao` e `quantidade_estoque` em `importacoes_nfe_itens`. **Essas colunas não existem em produção** (verificado). Elas entram com as próprias migrations (ALTER), mas também reescrevem funções por texto.
- **Suíte de NF-e:** os scripts `.test.sql` de NF-e não executam por falta de `empresa_id` nas fixtures (P0 já registrado). Sem ela não há teste de regressão para a 120000.

### 5.5 Testes necessários

1. NF 100, duplicata 60 → **recusa** com `IMPORT_NFE_DUPLICATAS_DIVERGENTES`.
2. NF 100, duplicata 100 → aceita.
3. Diferença de R$ 0,01 → aceita; R$ 0,02 → recusa.
4. Várias duplicatas (parcelas) somando o total → aceita; uma faltando → recusa.
5. Repetição da confirmação → idempotente, sem AP duplicado.
6. Suíte de NF-e com fixtures corrigidas, rodando na CI.

---

## 6. Pendências que bloqueiam a liberação

| # | Pendência | Bloqueia | Quem decide |
|---|---|---|---|
| P-1 | Aprovar a correção do achado 1.5 (usuário existente) antes da 121000 | 121000 | Produto + engenharia |
| P-2 | Decidir o teste controlado de provisionamento em produção | 121000 | Dono |
| P-3 | Nova migration de consumo do token no offline (3.5.2) | Vendas offline com desconto | Engenharia |
| P-4 | Validade do token offline | P-3 | Produto |
| P-5 | Rollback do kardex: captura de produção e arquivo de rollback | 155000 | Engenharia |
| P-6 | Suíte de NF-e com fixtures corrigidas | 120000, 130000, 140000 | Engenharia |
| P-7 | Decisão de produto sobre cobrança e contratação | 101000 e contratação | Dono |
| P-8 | Caminho de contratação (`commercial_*`, GROWTH-001) | Contratação em produção | Dono |
