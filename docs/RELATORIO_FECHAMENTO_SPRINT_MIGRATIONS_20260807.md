# Fechamento — Sprint de estabilização de migrations e reconstrução do banco

**Data:** 2026-08-07 · **PR:** #258 · **Branch:** `claude/audit-findings-go-live-qldlgw`
**Commits:** `ec4e3fad` … `667f8361` (11 commits)

---

## 1. O achado que define a sprint

Todos os defeitos desta sprint são a mesma coisa vista de ângulos diferentes:

> **Migration que assume o estado de produção como se fosse o estado do repositório.**

Nenhum deles jamais falharia em produção — falham só numa reconstrução limpa,
que é o único lugar onde o repositório é a verdade. Por isso ficaram anos
invisíveis: produção nunca é reconstruída.

O corolário operacional, que vale manter escrito:

> **`supabase_migrations.schema_migrations` não é evidência de execução.**
> Verificação de Go-Live tem de ser por objeto, não por ledger.

---

## 2. Migrations corrigidas

### 2.1 Objetos que o ledger dizia existir e não existiam

Auditoria sobre **as 257 entradas** do ledger (não só as 137 do `repair` de
2026-08-02): extração de todo objeto declarado pelos 237 arquivos
correspondentes e verificação de existência em produção. **12 objetos ausentes**,
em 4 migrations marcadas como aplicadas.

| Migration nunca executada | Objetos ausentes | Correção | Decisão |
|---|---|---|---|
| `091_fiscal_correlation_id` | 2 colunas, 2 índices, trigger + função | **309** | Corrigido |
| `288_pdv_certificacao_operacional` | `converter_venda_em_espera`, `uq_caixas_operador_aberto`, `retomar` na versão antiga | **310** | Corrigido |
| `235_observabilidade_pdv_visual` | 3 colunas de flag em `pdv_config` | **311** | Corrigido |
| `236/237_system_alerts` | tabela, RPC, kill switch | **311** | Corrigido |

**Causa raiz:** o `supabase migration repair` de 2026-08-02 inseriu 136 linhas no
ledger sem executar o SQL. Mas 235/236/237/288 já estavam no backup pré-repair —
ou seja, o defeito é anterior e mais amplo que aquele `repair`.

**Único com falha visível ao operador:** a 288. `caixaVendaEspera.impl.ts:186`
chama `converter_venda_em_espera`, inexistente em produção → PGRST202 **depois**
de a venda já ter sido finalizada. E `retomar_venda_em_espera` estava na versão
que marca `RETOMADA`, fazendo o pedido sumir da lista se o operador desistisse.

**Achado colateral:** `pdv_config_flags_visuais()` em produção não era definição
de migration nenhuma — era um stub manual, `SELECT false, false, false, false`,
sem ler `pdv_config`. Remendo aplicado direto no banco para a função não quebrar
sem as colunas da 235. Restaurada pela 311.

### 2.2 Inversões de ordem — a família 248/269/270/288/289

A ordenação de migrations é **lexicográfica pelo nome do arquivo**, e
`'2026…' < '248_'` porque no 2º caractere `'0' < '4'`. Arquivos com prefixo de
timestamp rodam **antes** dos numéricos `2xx`.

| Arquivo | Assumia | Consequência na reconstrução | Correção | Decisão |
|---|---|---|---|---|
| `20260717031639_248_fix_anon_grant_drift` | `devolver_ou_trocar_venda` já existe | `42883` — aborta | guarda `to_regprocedure` | Corrigido |
| `20260717031919_248_fix_quantidade_devolvida_grant` | `quantidade_devolvida_item_venda` já existe | idem | guarda `to_regprocedure` | Corrigido |
| `20260717031938_248_fix_quantidade_devolvida_anon_grant` | idem | idem | guarda `to_regprocedure` | Corrigido |
| `20260730093000` bloco 1 (`criar_produto_com_estoque_inicial`) | corpo vivo não contém a palavra `OPERADOR` | `MIG_CRIAR_PRODUTO_AINDA_CITA_OPERADOR` — o `replace` funcionou, a asserção é que era larga demais (batia num comentário) | asserção passa a ser sobre o **gate**, não sobre a palavra | Corrigido |
| `20260730093000` bloco 2 (`ajustar_estoque_manual`) | corpo vivo tem certa **formatação** | literal não casa (quebra após `:=` e linha em branco) → aborta | tolera quando não casa; **269** é a autoridade do estado final | Corrigido |
| `20260807002147_314` (minha) | prefixo de timestamp ordena depois de `248_` | `MIGRATION_314: devolver_ou_trocar_venda ausente` | renomeada para **`289_`** + ledger atualizado | Corrigido |

**Sobre a 289 (ex-314):** ela existe porque guardar os três arquivos acima não
basta — sem ela, a reconstrução terminaria com as funções criadas e **sem
restrição de acesso**, trocando um erro barulhento por uma brecha silenciosa
(`anon` executando RPC de devolução). A 289 reafirma o estado final de grants
numa posição que ordena depois de 248, 269, 270 e 288, com bloco de verificação
que falha se `anon` mantiver EXECUTE ou `authenticated` perder.

**Erro próprio registrado:** escrevi a 314 para "rodar depois da 248 em qualquer
ordenação" e a nomeei com prefixo de timestamp — exatamente a inversão que ela
existia para compensar. A guarda interna que eu havia posto foi o que apontou o
erro. Renomeada para `289_`, com verificação de ordenação par a par em vez de
suposição.

### 2.3 Outras correções

| Item | Problema | Correção | Decisão |
|---|---|---|---|
| **SSOT-01** | `unifiedCartStore.ts:373` tinha `const maxPermitido = 15`, enquanto a autoridade é `pdv_config.max_desconto_manual_item_percentual` (trigger da 122). Mudar o limite no banco não mudava o PDV. | **313** expõe o valor via `pdv_config_para_caixa_web()`; store passa a lê-lo; literal vira fallback nomeado para PDV offline. 4 testes de regressão. | Corrigido |
| **D-10** | `_backup_schema_migrations_20260802` era a única tabela de `public` legível por `anon` sem RLS. | **312** habilita RLS e revoga GRANTs, **preservando as 100 linhas** (evidência forense do próprio diagnóstico). | Corrigido |
| **282** | Guard comparava `pg_get_function_identity_arguments(...) = 'uuid, text'`, que nunca casa — essa função devolve os argumentos **com os nomes dos parâmetros**. Guard era no-op silencioso. | trocado por `to_regprocedure` | Corrigido |
| **B-7** | GitHub Actions parou de criar runs às 15:37 UTC de 2026-08-06. | Indisponibilidade do lado do GitHub; normalizou sozinho às 00:11 UTC. | Documentado |
| **CHAVE-SMOKE-123** | Linha histórica de smoke test viola `documentos_fiscais_chave_formato` (constraint `NOT VALID` desde a 280). Fez a 309 falhar via UPDATE de backfill. | Backfill passou a vir do DEFAULT do `ADD COLUMN`, que não reprocessa CHECK de linha existente. **Linha preservada** — expurgo previsto no DB-03. | Mantido por risco |
| **252 `venda_finance_context`** | Tabela + 3 trigger functions ausentes em produção. | **Não reaplicada:** nenhuma função de produção a referencia (`pg_proc.prosrc` sem ocorrências) e nenhum código da aplicação a lê. Aplicar acrescentaria triggers no caminho financeiro às vésperas do Go-Live sem benefício. | Mantido por risco |

---

## 3. CI — o que estava cego

Cadeia completa, cada elo com log:

1. **`build-and-test` quebrado** desde que `@supabase/auth-js@2.110.5` passou a
   exigir node `>=22`; `ci-pdv-local.yml:58` pinava `'20'`. `npm ci` morria em ~1s
   com `EBADENGINE`.
2. **Os jobs de e2e dependem dele** (`needs: build-and-test`) → **o e2e nunca
   chegou a rodar**.
3. **Os JWTs do `rls-rest-gate` venceram em 2026-05-17** — quase três meses de um
   gate marcado como obrigatório (`CI_RLS_SMOKE_REQUIRED=true`) reprovando sem
   validar nada. Passou despercebido porque a mensagem acusava **regressão de
   RLS**, não credencial vencida. Ninguém investiga um gate que parece reprovar
   por motivo legítimo.
4. **As credenciais de login do e2e também são inválidas** — revelado só depois
   de o gate passar a emitir o token na hora:
   `{"error_code":"invalid_credentials"}` para PAINEL e CAIXA.

**Correções:** Node 22 nos dois workflows que faltavam + `engines.node` da raiz
(que declarava `>=20.0.0`, falso); `p0-rls-rest-smoke.mjs` checa `exp` e falha
nomeando o secret e a data; o token passa a ser emitido a cada execução via
`POST /auth/v1/token?grant_type=password`, usando credenciais que já existem
como secret — **sem secret novo**. Relatório passa a trazer `origem_jwt`.

---

## 4. Evidência de testes

| Verificação | Resultado |
|---|---|
| `pdv-importados` (Vitest) | **855/855** |
| `shared-core` (Vitest) | **184/184** (+4 novos, regressão do teto de desconto) |
| `pdv-local` (Vitest) | **57/57** |
| `guard:all` | 9/9, sem colisão de sequência |
| `typecheck` | limpo |
| Migrations 309–313, 289 | aplicadas em produção, cada uma com bloco `DO` de prova viva |

Cada migration desta sprint carrega verificação interna que aborta se o efeito
pretendido não se materializar — não é `apply` cego.

---

## 5. Estado do CI em `667f8361`

| Check | Estado | Observação |
|---|---|---|
| `build-and-test` | ✅ **verde** | destravado nesta sprint |
| `gitleaks` | ✅ | |
| `outbox-contract` | ✅ | |
| `edge-functions-typecheck` | ✅ | |
| `anti-replay-diagnostic-gate` | ✅ | |
| `Supabase local RLS smoke` | ❌ | parou na **224** (ver §6) |
| `Test RLS scope by profile` | ❌ | mesma reconstrução, mesmo ponto |
| `rls-rest-gate` | ❌ | CI-01 — credencial; **diagnóstico claro** |
| `migration-remote-drift` | ❌ | D-11 — escrituração |
| `E2E crítico` | ❌ | voltou a **rodar** nesta sprint; causa da falha ainda não lida |

**Progressão da reconstrução ao longo da sprint** — cada correção moveu a
barreira adiante, o que é a medida objetiva de avanço:

```
20260717031639  →  20260730093000 (bloco 1)  →  (bloco 2)  →  314/289  →  224
```

---

## 6. Migration 224 — registrado, não corrigido

```
ERROR: policy "clientes_write_gerente_loja" for table "clientes" does not exist
       (SQLSTATE 42704)
  em 224_rls_initplan_wrap_auth_select.sql
  ALTER POLICY "clientes_write_gerente_loja" ON public.clientes …
```

`ALTER POLICY` não aceita `IF EXISTS`, e a policy é criada por migration que
ordena depois. Mesma família das anteriores.

**Deliberadamente não corrigido nesta sprint.** A 224 contém **94 statements
`ALTER POLICY`**. Guardar um por um às cegas, sem antes levantar quantas policies
estão de fato ausentes naquela posição da reconstrução, trocaria um erro visível
por 94 no-ops silenciosos — e policies de RLS não podem virar no-op sem que
alguém garanta o estado final em outro ponto. Exige janela técnica própria.

---

## 7. Mapa de padrões frágeis — **registro, sem correção em lote**

Levantamento sobre os 247 arquivos de migration.

| Padrão | Ocorrências | Por que é frágil |
|---|---|---|
| `pg_get_functiondef` | 3 arquivos | Patch textual sobre o corpo vivo. Depende de formatação e de comentários — quebra quando o corpo da reconstrução difere do de produção. **Duas das três falhas da sprint vieram daqui.** |
| `replace(` | 2 arquivos | Idem. `081` e `20260730093000`. |
| `position(` | 2 arquivos | Asserção por substring. Fácil de escrever larga demais (bater em comentário) — foi o caso do bloco 1 da `20260730093000`. |
| `ALTER POLICY` | 3 arquivos (`224`, `226`, `251`) | Sem `IF EXISTS`. **94 statements só na 224.** |
| `DROP FUNCTION` + `CREATE` | 17 arquivos | Se o `DROP` roda antes de a função existir, ou se a assinatura mudou, aborta. Não auditado individualmente. |
| Dependência futura (arquivo referencia objeto criado por arquivo posterior) | 3 detectadas e corrigidas | Varredura estrutural pega essas; **não pega as semânticas** (texto/formatação esperados). |
| Mistura timestamp-first / numeric-first | **45 timestamp × 202 numérico** | Raiz de toda a família 248/269/270/288/289. `'2026…' < '2xx_'` — ordem contraintuitiva e não sinalizada em lugar nenhum. |

**Limite do método, registrado de propósito:** a varredura estática de inversões
achou 3 — todas estruturais. Não pegou as falhas semânticas do bloco 1 e do
bloco 2 da `20260730093000`. **Só a reconstrução real as encontra.** Portanto o
job `Supabase local RLS smoke` é a única prova confiável desta frente e deve
permanecer como gate obrigatório.

**Recomendação para a próxima janela técnica** (não executar agora): padronizar o
prefixo de migrations num único esquema. A mistura é a causa estrutural, e
enquanto ela existir novas migrations vão reintroduzir o mesmo defeito — como a
minha 314 demonstrou.

---

## 8. Critério de encerramento

| Critério | Estado |
|---|---|
| `build-and-test` verde | ✅ |
| Migrations novas sem regressão | ✅ — 1096 testes verdes; 309–313 e 289 com prova viva; nenhuma falha de CI atribuível a elas |
| RLS smoke com diagnóstico claro | ✅ — nomeia o secret e a data em vez de simular falha de RLS |
| Bloqueadores conhecidos documentados | ✅ — D-9, D-10, D-11, SSOT-01, CI-01, 224 e o mapa de §7 |

**Frente encerrada.**

### Pendências externas — sem novo esforço sem evidência nova

- **CI-01 — credenciais de teste.** `invalid_credentials` para PAINEL e CAIXA.
  Restaurar os usuários/senhas, ou corrigir para qual projeto os secrets apontam.
  Com o `build-and-test` verde, o e2e volta a rodar assim que forem restauradas.
- **D-11 — validação de ledger.** Os 18 objetos das migrations 228/231/244/248
  existem em produção; falta a linha no ledger. **Não executar `migration repair`
  com base em presença por nome de objeto** — foi exatamente isso que produziu o
  D-9. Exige comparação de corpo de função, colunas, índices, policies e grants.
- **Migration 224.** Ver §6.
