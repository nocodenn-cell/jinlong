# Procedimento — fechamento com venda em espera (`20261119120000` / `120100`)

**Data das verificações:** 2026-11-19 · **Homolog:** `yvdilcmxyjafnnsfdtam` · **Produção:** `kbabmewnahysfvlybiak`
**Escopo:** origem do wrapper, comparação dos bancos, compatibilidade, rollback e evidências.
**Nada foi aplicado nem alterado** em homolog ou produção nesta rodada. Verificações somente leitura, e testes em clones descartáveis.

> **Correção:** a versão anterior deste documento dizia que o wrapper `public.fechar_caixa_atomico` estava fora do repositório. **Isso estava errado.** O wrapper é gerado pela `20261019140000`. A diferença real é outra: a ordem de dependência com a `20261023200000` (ver §3).

---

## 1. Origem do wrapper `public.fechar_caixa_atomico`

- `backend/supabase/migrations/20261019140000_multiempresa_fase2_guardas.sql` (§4, "Envelopes de escopo nas RPCs SECURITY DEFINER expostas a authenticated") gera, para cada RPC exposta ao `authenticated`, um **wrapper `public`** com checagens `fp_assert_loja` e uma chamada a `internal.<nome>`. O comentário gravado é `Envelope multiempresa (20261019140000): exige escopo de loja/empresa e delega para internal.<nome>`.
- A função original (`public.fechar_caixa_atomico`, criada em `20261007190000` e ajustada em `20260929120000`, `20260902100200` e `20260621002600`) é movida para `internal`, e o `public` vira o envelope.
- A `20261119120000` faz `CREATE OR REPLACE` em `internal.fechar_caixa_atomico`, com o D-06 e o patch de troca de operador já incluído.
- O patch de troca de operador (`20261023200000`) altera o corpo de **todas** as funções `fechar_caixa_atomico` encontradas em `public` ou `internal` por substituição de texto (`internal.fp_troca_operador_patch`). Ele depende de as funções `internal.fp_operador_ativo_caixa` e `internal.fp_participou_caixa` existirem.

## 2. Comparação dos bancos (somente leitura)

| Objeto | Homolog | Produção | Repositório |
|---|---|---|---|
| `public.fechar_caixa_atomico` (envelope, `chama_internal`) | md5 `7bd4d4c4…`, 254 caracteres, delega | md5 `7bd4d4c4…`, 254 caracteres, delega | gerado por `20261019140000` |
| `internal.fechar_caixa_atomico` | md5 `d18bff33…`, 3360 caracteres, **com D-06** | md5 `3c3dab6b…`, 2982 caracteres, **sem D-06 e sem patch de troca** | `20261119120000` = homolog (md5 validado) |
| `internal.fp_operador_ativo_caixa` / `fp_participou_caixa` / `fp_troca_operador_patch` | existem | **não existem** | `20261023200000` |
| `20261023200000` registrada | sim | **não** | em `main`, não está no manifesto de adiadas |
| `20261119120000` / `120100` registradas | sim | não | em `main` |
| `trg_caixas_bloqueia_fechamento_em_espera` (D1, `20261106100000`) | ativo | ausente | em `main`, pendente |

**Conclusão:** não há drift do wrapper. Homolog e produção têm o mesmo envelope. A diferença está no `internal`: produção ainda não recebeu a `20261023200000` (troca de operador) nem a `20261119120000` (D-06).

## 3. Dependência de ordem (risco real)

Teste reproduzível em clone descartável do replay da `main` (`fechar-caixa-app-flow-espera.test.sql`, fluxo com `authenticated` e `auth.uid()` do operador):

| Cenário | Passo 1: fechar com espera aberta | Passo 2: descartar espera (RPC) | Passo 3: fechar após descarte |
|---|---|---|---|
| **A.** Controle, sem `20261119` (estado de produção hoje) | **OK** (caixa fecha com espera pendente) | — | — |
| **B.** `20261119120000` + `120100` aplicadas (estado do homolog) | **ERRO** `FECHAR_CAIXA_VENDAS_EM_ESPERA` | OK | **OK** (FECHADO) |
| **C.** `20261119120000` aplicada **sem** `20261023200000` | **ERRO** `function internal.fp_operador_ativo_caixa(uuid, uuid) does not exist` | OK | **ERRO** (mesma função ausente) |

- **A** mostra a lacuna real de produção: hoje o fechamento aceita venda em espera (a regra D-06 não existe lá; a proteção D1 do trigger também ainda não está).
- **B** prova que a migration funciona no fluxo real do app.
- **C** mostra o risco: aplicar a `20261119120000` isolada **impede o fechamento de caixa**, sem erro na aplicação da migration. Ela só falha em tempo de execução.

**Regra:** `20261023200000` deve estar aplicada antes de `20261119120000`. O Supabase CLI aplica pendências em ordem de versão, então `20261023200000` vai antes quando as duas estiverem pendentes ao mesmo tempo. O risco aparece em aplicação manual, fora de ordem, ou com a `20261119` aplicada sozinha.

## 4. Estratégia

- **Não criar migration corretiva para o wrapper.** Não há o que corrigir nele. Uma migration nova para isso criaria drift sem motivo.
- **Não editar a `20261119120000`.** Ela já está registrada no homolog. Editar o arquivo quebraria o md5 validado.
- **Aplicar em produção, quando autorizado, nesta ordem:** `20261023200000` → `20261119120000` → `20261119120100`. Antes disso, a `20261023200000` precisa de autorização própria, porque altera o comportamento de troca de operador em várias RPCs. A decisão é do dono.
- **Pré-checagem obrigatória antes da produção:** confirmar que `internal.fp_operador_ativo_caixa` e `internal.fp_participou_caixa` existem; se não existirem, parar.

## 5. Rollback

- **`20261119120000`:** `backend/supabase/rollback/20261119120000_fechar_caixa_bloqueia_vendas_em_espera.rollback.sql`. Restaura o corpo sem a checagem D-06. **Válido apenas em bancos com `20261023200000` aplicada.** Testado em clone: aplicar, reverter e rodar o fluxo do app dá `OK` no passo 1, que é o comportamento anterior.
- **`20261119120100`:** rollback já existe em `backend/supabase/rollback/20261119120100_vendas_em_espera_descarte_auditavel.rollback.sql`.
- **Limite:** o rollback da `120000` não reverte a `120100`. Reverter as duas exige a ordem inversa.

## 6. Backup (quando autorizado)

- Export de `pg_get_functiondef` de `public.fechar_caixa_atomico` e `internal.fechar_caixa_atomico`, com md5, antes de qualquer `CREATE OR REPLACE`.
- Snapshot de `caixas` e `vendas_em_espera` (contagem por status).

## 7. Evidências

- `backend/scripts/fechar-caixa-app-flow-espera.test.sql`: fluxo do app, imprime o desfecho de cada passo, sem impor estado.
- Resultados A, B e C acima, em clones descartáveis criados e removidos nesta rodada.
- Rollback testado (§5).
- md5 e leituras de `pg_proc` e `schema_migrations` em homolog e produção, somente `SELECT`.

## 8. Decisões que dependem do dono

1. Autorizar a `20261023200000` em produção (troca de operador), que é pré-requisito da `20261119120000`.
2. Autorizar a janela da `20261119120000` e `120100` em produção, depois do item 1.
3. Confirmar que o D1 (`20261106100000`) segue no PR, como camada extra independente do wrapper.

---

## 9. Registro de execução: `20261023200000` em produção (2026-11-19)

**Autorizado pelo dono.** Aplicada em produção (`kbabmewnahysfvlybiak`) em uma transação, com o SQL do arquivo `backend/supabase/migrations/20261023200000_pdv_troca_operador_caixa.sql`.

**Validação antes da escrita:**
- Pré-checagens de produção: os 10 alvos de patch obrigatórios existem (1 ocorrência cada); nenhum objeto novo existia (tabela `caixa_operadores`, RPCs, trigger, políticas).
- Clone do replay da `main` levado ao estado de produção pelo rollback existente: hashes de `public.fechar_caixa_atomico` e `internal.fechar_caixa_atomico` batem com produção (`7bd4d4…` e `3c3dab…`).
- Migration aplicada no clone sem erro. Repositório `backend/scripts/pdv-troca-operador.test.mjs`: **17 testes ok**.
- Cadeia completa no clone (`20261023200000` + `20261119120000` + `120100`): fluxo do app bloqueia com espera, descarta e fecha. Hash de `internal` = homolog (`d18bff33…`).

**Pós-estado em produção (verificado):**
- `supabase_migrations.schema_migrations` tem `20261023200000`.
- `internal.fechar_caixa_atomico` = md5 `bb2afd1c…` (idêntico ao clone validado, sem D-06).
- `public.fechar_caixa_atomico` = md5 `7bd4d4…` (inalterado).
- Tabela `caixa_operadores` criada, 0 linhas. Trigger `trg_caixas_fechamento_operador` ativo. 6 RPCs criadas. 5 políticas de leitura de turno.

**Nota sobre o registro de versão:** a ferramenta `apply_migration` grava com timestamp próprio e não aceita versão. Para manter o histórico igual ao arquivo do repositório, a aplicação foi feita via `execute_sql` numa transação que também inseriu `20261023200000` em `supabase_migrations.schema_migrations`, com o nome do arquivo. Isso registra uma aplicação real, não uma marcação artificial.

**Pendente:** `20261119120000` e `120100` continuam não aplicadas em produção. Dependem de nova autorização, agora que o pré-requisito está atendido.

---

## 10. Registro de execução: `20261119120000` e `20261119120100` em produção (2026-11-19)

**Autorizado pelo dono.** Aplicadas em produção (`kbabmewnahysfvlybiak`) numa única transação, na ordem do repositório, com os dois registros em `supabase_migrations.schema_migrations`.

**Pré-checagens (antes da escrita):**
- `20261023200000` registrada; `internal.fechar_caixa_atomico` com md5 `bb2afd1c…` (estado esperado após §9).
- Coluna `descartada_motivo` existe (exigida pela 120100).
- Esperas ativas: 2, ambas em caixa **já FECHADO** desde 18/07. A checagem D-06 só age no fechamento de caixa aberto, então não bloqueia nenhum caixa atual. O único caixa aberto não tem espera.

**Pós-estado verificado:**
- `internal.fechar_caixa_atomico` = md5 `d18bff3360c1e1c8ad36d37c94d9029c`, **idêntico ao homolog**, com a checagem `FECHAR_CAIXA_VENDAS_EM_ESPERA`.
- `public.fechar_caixa_atomico` inalterado (`7bd4d4…`).
- Coluna `descartada_por` criada; `CHECK vendas_em_espera_descarte_auditavel_chk` criado como `NOT VALID` (não revalida histórico); `internal.descartar_venda_em_espera` atualizada.
- Esperas existentes: 2, inalteradas. Nenhum dado de venda ou caixa foi alterado.

**Pendências técnicas (não bloqueiam):**
- As 2 esperas antigas continuam `EM_ESPERA` num caixa fechado. Não afetam o fechamento, mas poluem a fila. Decisão do dono sobre descarte, com motivo, pelo procedimento auditável.
- `VALIDATE CONSTRAINT` da 120100 só depois de conferir o histórico (contrato da migration).
- Prova por teste de fluxo em produção não foi feita, para não criar dados de teste no banco real. A equivalência foi comprovada pelo hash do corpo com o homolog, que foi testado no fluxo do app (`fechar-caixa-app-flow-espera.test.sql`).

---

## 11. Descarte administrativo das 2 esperas antigas (2026-11-19)

**Autorizado pelo dono** ("descarta as 2 esperas antigas com o motivo registrado").

- Esperas: `174f885c…` e `17ca513c…`, `EM_ESPERA`, do `Operador E2E` (`b7ec95bb…`), no caixa `1b28f7bf…`, já FECHADO desde 18/07/2026.
- Pré-checagem: nenhuma venda registrada no caixa após a criação das esperas.
- Execução: `UPDATE` direto numa transação, com motivo, autor e data gravados (mesmos campos da RPC `descartar_venda_em_espera`). A RPC não foi usada porque só aceita o próprio operador da espera.
- **Atribuição:** `descartada_por` recebe o id do operador da espera, porque a constraint exige um usuário. O motivo registra que o descarte foi administrativo, autorizado pelo dono e executado por suporte técnico via SQL.
- Pós-estado: as 2 linhas estão `DESCARTADA`, com motivo, autor e data. Esperas ativas no banco: 0.
- Pendência: `VALIDATE CONSTRAINT vendas_em_espera_descarte_auditavel_chk` continua não validado, por decisão do contrato da 120100.
