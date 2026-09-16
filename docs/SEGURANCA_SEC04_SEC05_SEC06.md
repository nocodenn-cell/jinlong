# Hardening SEC-04 / SEC-05 / SEC-06

Branch: `fix/security-sec04-sec05-sec06` · Data: 2026-09-16

Os dossiês das microauditorias SEC-04/05/06 não estão no repositório; a baseline
foi a descrição da missão, reverificada contra o código atual **e** contra o
catálogo de produção (`pg_proc`, somente leitura). Nenhuma DDL foi aplicada em
produção nesta mudança.

`docs/ARQUITETURA_REGRAS_NEGOCIO.md` não existe no repositório. As regras usadas
vêm de `docs/AUTHORIZATION_MATRIX.md` e de
`20260829120000_fase6_consolida_padrao_a_dono_global.sql` (Padrão A: DONO/ADMIN
globais, GERENTE restrito à própria loja).

## Estado de deploy observado

Produção está **atrás** do repositório (ex.: `20260902130000` e `20260902140300`,
snapshot fiscal da v4, ainda não aplicadas). As novas migrations partem da
cadeia do repositório e só dependem de objetos presentes nas duas pontas.

Conferência de corpo (md5 do `prosrc` normalizado) repo × produção: **iguais**
para `finalizar_venda_transacional_canonica_v4` (wrapper),
`transferir_estoque_seguro`, `transferir_estoque_entre_lojas`,
`confirmar_remessa_entrada`, `registrar_pagamento_contas_pagar`,
`marcar_comissoes_pagas` e `retomar_caixa_atomico`.

---

## SEC-04 — token de gerente sem vínculo de loja (P0)

### v4 — corrigido (`20260916120000_sec04_token_gerente_vinculo_loja_v4.sql`)

- **Falha:** a `v4_unscoped` validava `tokens_desconto_gerente` só por
  token + usado + expiração, tanto no token de desconto quanto no de limite de
  crédito.
- **Por que `tokens_desconto_gerente.loja_id` não serve:** o valor vem do corpo
  da requisição da Edge `validar-gerente` (o cliente controla), e o PDV web nem
  o envia.
- **Fonte confiável:** `criado_por` — o `auth.uid()` que a Edge preenche —
  resolvido para `usuarios.loja_id`. É o mesmo padrão de `retomar_caixa_atomico`.
- **Helper:** `internal.token_gerente_fora_da_loja(token, loja)`, sem EXECUTE
  para a API.
- **Onde a checagem roda:** no wrapper v4, **depois** da guarda de escopo de
  20260809120837. Nesse ponto, `p_loja_id` já foi provado igual à loja do
  usuário da sessão **e** à loja do caixa ABERTO do operador. O caller não
  escolhe a loja.
- **Regras:**
  - o emissor tem que ser da loja da operação, ou DONO/ADMIN (Padrão A);
  - quando `loja_id` estiver gravado, tem que bater com a loja;
  - token sem emissor é recusado.
- **Token inexistente** não é bloqueado pelo helper. Existência, uso e expiração
  continuam com a `v4_unscoped`, então o replay idempotente de venda já
  concluída (token já `usado`) segue funcionando.
- **Erros:** os códigos já mapeados no app,
  `FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_INVALIDO` e
  `FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_INVALIDO`.
- **Por que no wrapper e não na `_unscoped`:** o wrapper é o único caminho até a
  `_unscoped` (sem grant a PUBLIC/anon/authenticated/service_role, verificado
  em produção). Assim a correção evita recopiar as ~550 linhas do core
  transacional.

### v2 — corrigido por convergência (`20260916120100_sec04_v2_v3_legacy_disabled_convergencia.sql`)

- **Produção:** todos os overloads v2/v3 são stub `LEGACY_DISABLED_USE_V4`, sem
  EXECUTE para anon/authenticated. O P0 da v2 **não é explorável em produção**.
- **Drift real no repositório:** `20260621002500_229` e `20260621003100_235`
  recriam a v2 de 13 args com corpo vivo **depois** dos bloqueios de 2026-06-19/20.
  Um banco reconstruído do repositório (CI, staging, novo cliente) sobe com a v2
  viva (SECURITY DEFINER, token sem loja, EXECUTE para service_role).
- **Correção:** reaplica o stub em todo overload v2/v3 que ainda não é stub,
  lendo assinatura, defaults e retorno do catálogo. Também revoga PUBLIC, anon e
  authenticated.
- **Efeito:** em produção, nenhuma mudança de comportamento. Sem DROP, então
  `database.types.ts` e a regra de negação em `test:rls-scope` continuam válidos.

### Fora do escopo, registrado

- `validar-gerente` ainda grava `loja_id` do corpo em tokens legados. Com a
  checagem por emissor isso não abre brecha: um `loja_id` forjado só torna o
  token **menos** utilizável. Derivar a loja no servidor, como já é feito para
  tokens tipados, seria uma melhoria de consistência.
- `finalizar_venda_transacional(9 args)` também consome o token sem loja, mas só
  service_role tem EXECUTE e não há consumidor.

---

## SEC-05 — RPCs de alto risco

| RPC | Situação atual | Ação |
|---|---|---|
| `transferir_estoque_seguro` | Perfil GERENTE/DONO/ADMIN; GERENTE só se `loja_id` ∈ {origem, destino}; idempotência, lock, saldo esperado. Corpo = produção. | Sem alteração |
| `transferir_estoque_entre_lojas` | Mesma guarda, sem consumidor | SEC-06 (revoke) |
| `confirmar_remessa_entrada` | GERENTE restrito à loja da remessa (`REMESSA_LOJA_INVALIDA`), status CONFERIDO/DIVERGENTE. Corpo = produção. | Sem alteração |
| `registrar_pagamento_contas_pagar` | Usuário ativo GERENTE/DONO/ADMIN; `PAGAMENTO_LOJA` rejeita **qualquer** cross-loja (inclusive DONO); caixa da mesma loja; token tipado `PAGAMENTO_AP` preso a alvo + loja (`consumir_token_autorizacao_operacao`). | Sem alteração |
| `receber_ordem_compra` | GERENTE restrito à loja da OC (`OC_LOJA`), conferência obrigatória (produção e `20260805193920_295`). | Sem alteração |
| `marcar_comissoes_pagas` | Delega para `liquidar_comissoes`, que exige GERENTE/DONO/ADMIN e restringe GERENTE/ADMIN a `p_loja_id`; idempotência por lote. | Sem alteração |

Os quatro itens secundários não têm vulnerabilidade comprovada no estado atual.

**Observação (defesa em profundidade, não explorável hoje):** nas guardas de
transferência, `v_loja_usuario NOT IN (origem, destino)` resulta em NULL, e a
guarda é pulada, se `usuarios.loja_id` for NULL. Isso não acontece porque
`usuarios.loja_id` é `NOT NULL` em produção. Parâmetros de loja NULL também
falham em seguida (`estoque.loja_id NOT NULL` ou origem inexistente), com
rollback. As transferências também não checam `usuarios.ativo`. Os dois pontos
ficam como candidatos a hardening futuro, sem mudança de regra agora.

---

## SEC-06 — transferência legada (`20260916120200_sec06_revoke_transferir_estoque_entre_lojas_legado.sql`)

- **Referências confirmadas:** `database.types.ts` (arquivo gerado), a
  documentação, a regressão Fase 3 e 3 regras de `test:rls-scope`. Não há
  `.rpc()` no app, nas Edge Functions nem no PDV local.
- **Testes migrados:**
  - as 3 regras de `test:rls-scope` agora usam `transferir_estoque_seguro`;
  - nova regra: o legado retorna `permission denied`;
  - a regressão Fase 3 passou a checar os privilégios do legado. A guarda de
    tenant segue coberta pela canônica.
- **Correção:** `REVOKE ALL` de PUBLIC, anon, authenticated e service_role.
  Sem DROP, para não mexer em tipos gerados. O DROP pode vir depois, como
  limpeza.
- **Regra de negócio preservada:** GERENTE A pode A→B e B→A, e é bloqueado em
  B→C. DONO/ADMIN seguem globais.

### Drift / resiliência das transferências

- `20260828140000` é a **última** definição das duas funções. Migrations
  posteriores só as mencionam em comentário, e nenhuma migration numérica
  (`0xx_`/`1xx_`) é ordenada depois dela.
- A definição é determinística (`CREATE OR REPLACE` + `DO $verify$` que falha
  se a guarda sumir). Os corpos em produção são idênticos aos do repositório.
- Não há regressão a corrigir. A nova migration também confirma, na aplicação,
  que a canônica mantém `TRANSFERENCIA_LOJA_INVALIDA` e segue fechada para anon.

---

## SECURITY DEFINER / search_path das funções alteradas

| Função | SECURITY | search_path |
|---|---|---|
| `finalizar_venda_transacional_canonica_v4` | DEFINER | `public` |
| `internal.token_gerente_fora_da_loja` | INVOKER (chamada pelo wrapper DEFINER) | `public` |
| stubs v2/v3 reescritos | INVOKER (só `RAISE`) | `public` |
| `transferir_estoque_entre_lojas` | DEFINER (inalterada) | `public`; sem EXECUTE |

## Testes

- Nova suíte `backend/scripts/sec04-token-gerente-tenant.test.sql`, registrada em
  `test:financial`. Cobre:
  - matriz do helper;
  - negação cross-loja (desconto, limite de crédito, `loja_id` forjado,
    `p_loja_id` manipulado);
  - positivos (mesma loja, DONO);
  - v2/v3 mortas.
- `fase3-tenant-isolation-transferencias-remessas.test.sql` e
  `test-rls-scope.mjs` atualizados (SEC-06).
- Validação local: sem Docker nesta máquina. As 3 migrations e a suíte SEC-04
  rodaram em PGlite contra um schema mínimo que reproduz as assinaturas reais
  (inclusive a v2 viva do drift). Aplicação dupla funcionou e todos os cenários
  passaram. A execução completa sobre a cadeia real fica com o CI
  (`ci-backend-supabase.yml`: `db reset` + `test:rls-scope` + `test:financial`).
