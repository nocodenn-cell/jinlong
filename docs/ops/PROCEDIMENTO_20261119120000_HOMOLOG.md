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
