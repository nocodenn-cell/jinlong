# Fase 2 — Estoque: fechamento definitivo (migration 248 aplicada)

**Data:** 2026-07-17 · **Projeto:** `jinlong` (`kbabmewnahysfvlybiak`) · **Status: FASE 2 — 100% (código + banco).**

Este documento fecha a única pendência que restava da Fase 2 (ver
`docs/sprint-ux-conclusao/FASE_2_ESTOQUE.md` e `FASE_3_FINANCEIRO.md` para o
fechamento de código já concluído). Migration 248 (Devolução/Troca) foi
aplicada em produção com autorização explícita do usuário.

## 1. Sequência executada

1. **Capturado** `pg_get_functiondef(cancelar_venda_transacional)` — corpo real
   PRE-248 de produção, salvo em `backend/supabase/reconciliation/02_rollback.sql`.
2. **PITR/snapshot:** `jinlong` está no plano **Free** do Supabase — não existe
   PITR nesse plano, e não há ferramenta disponível para disparar um snapshot
   sob demanda (ação exclusiva do Dashboard). Reportado ao usuário; decisão
   explícita: prosseguir com rollback via script (fix-forward), não via
   snapshot de plataforma. Risco residual documentado abaixo.
3. **Estado PRE reconfirmado** imediatamente antes da aplicação — os 7 objetos
   da 248 seguiam 100% ausentes, idêntico à auditoria de 2026-07-16.
4. **Migration 248 aplicada** via `apply_migration` (MCP Supabase, conexão
   direta — não é `execute_sql` solto).
5. **Validação estrutural pós-aplicação:** 7/7 objetos presentes (tabelas,
   funções, coluna, CHECK constraint).
6. **Achado de segurança #1:** `devolver_ou_trocar_venda` — apesar do arquivo
   de migration fazer `REVOKE ALL ... FROM PUBLIC` seguido de `GRANT` só para
   `authenticated`/`service_role`, o papel `anon` apareceu com `EXECUTE`.
   Causa: neste projeto Supabase, privilégios padrão de schema concedem
   `EXECUTE` a `anon` diretamente (não via `PUBLIC`), então `REVOKE ... FROM
   PUBLIC` não alcança esse grant — mesmo padrão de drift já documentado para
   `finalizar_venda_transacional_canonica_v4` no §8.0 deste pacote. Como a
   função é `SECURITY DEFINER` com fallback `COALESCE(auth.uid(),
   p_operador_id)`, deixar `anon` com `EXECUTE` teria criado uma superfície de
   ataque: um chamador anônimo poderia tentar se passar por um operador
   informando `p_operador_id` diretamente (a checagem de perfil/loja dentro da
   função ainda bloquearia o abuso, mas a superfície não deveria existir para
   `anon`). **Corrigido** via `REVOKE EXECUTE ... FROM anon` explícito.
7. **Achado de segurança #2:** `quantidade_devolvida_item_venda` (helper de
   leitura introduzido pela 248) **nunca teve `GRANT`/`REVOKE` no arquivo
   original** — herdou o privilégio padrão do schema, que incluía `PUBLIC` e
   `anon`. É `SECURITY DEFINER`, ignora RLS, e não faz nenhuma checagem de
   loja/perfil internamente — qualquer papel com `EXECUTE` podia consultar a
   quantidade já devolvida de **qualquer** `item_venda_id` do sistema, de
   qualquer loja. **Corrigido**: restringido a `authenticated` + `service_role`,
   igual à RPC principal.
8. Ambos os achados foram versionados como `backend/supabase/migrations/277_fix_devolver_venda_anon_grant.sql`
   (idempotente — `REVOKE` em papel sem o privilégio é no-op) e aplicados em
   produção. `guard:migrations` local confirma: 190 migrations, sem colisão.
9. **Smoke comportamental completo, direto em produção, dentro de transações
   com `ROLLBACK` explícito** (o script local `homolog_sprint_b_devolucao_smoke.sql`
   é para Docker local, insere dados fake e faz `COMMIT` — não pode rodar
   contra produção como está; este ambiente também não tem Docker local
   disponível para rodá-lo lá):
   - **Devolução parcial (DINHEIRO):** venda de teste descartável → chama
     `devolver_ou_trocar_venda` → confirma estoque incrementado, caixa
     debitado, `devolucoes` registrada, `estoque_reposicoes_devolucao`
     registrada, evento `SALE_PARTIAL_RETURN` no ledger, `v_kardex_unificado`
     mostra `ENTRADA_DEVOLUCAO_CLIENTE` → chama de novo com a **mesma**
     `idempotency_key` (confirma idempotência, não duplica) → `ROLLBACK`.
   - **Cancelamento com `contas_receber` vinculada (comportamento novo da 248
     em `cancelar_venda_transacional`):** venda de teste com título em aberto
     vinculado → chama `cancelar_venda_transacional` → confirma estoque
     restaurado, `contas_receber` marcada `CANCELADO`/`valor_aberto = 0`,
     venda marcada `CANCELADA`, auditoria criada, evento `SALE_CANCELLED` no
     ledger (comportamento que a versão PRE-248 não tinha) → `ROLLBACK`.
   - **Ambos os smokes:** verificado após o `ROLLBACK` que **zero linhas**
     dos dados de teste (loja, usuário, produto, caixa, venda, `contas_receber`,
     `auth.users`) permaneceram em produção.
10. **Não-regressão confirmada:** `finalizar_venda_transacional_canonica_v4`
    (fluxo canônico de venda web), `registrar_venda_com_itens` (PDV local) e
    `cancelar_venda_transacional` continuam presentes e funcionais.
11. `guard:all` local: 8/8 OK. Typecheck limpo (sem alteração de código nesta
    etapa — só banco).

## 2. Evidências (estado final em produção)

| Item | Resultado |
|---|---|
| `venda_pos_venda_operacoes`, `venda_pos_venda_itens`, `estoque_reposicoes_devolucao` | Criadas, RLS ativa, 1 policy por-loja cada |
| `devolver_ou_trocar_venda` | Criada, `EXECUTE`: `authenticated`, `service_role` (sem `anon`) |
| `quantidade_devolvida_item_venda` | Criada, `EXECUTE`: `authenticated`, `service_role` (sem `anon`/`PUBLIC`) |
| `devolucoes.operacao_id` | Coluna adicionada |
| `venda_eventos_event_type_check` | Estendido para incluir `SALE_PARTIAL_RETURN` |
| `v_kardex_unificado` | Substituída, inclui ramo de devolução |
| `cancelar_venda_transacional` | Substituída (patch: cancela `contas_receber` vinculada + emite `SALE_CANCELLED`) |
| Smoke devolução parcial (DINHEIRO, idempotência) | ✅ passou, zero resíduo |
| Smoke cancelamento com `contas_receber` | ✅ passou, zero resíduo |
| Não-regressão (v4, PDV local, cancelar) | ✅ todas presentes |
| `guard:all` / `guard:migrations` | 8/8 OK / sem colisão |

## 3. Riscos restantes

- **Sem PITR** (plano Free) — mitigado por rollback via script totalmente
  testado (corpo exato de `cancelar_venda_transacional` PRE-248 capturado;
  view e CHECK PRE-248 já estavam capturados desde 2026-07-16), mas não cobre
  erro de operador durante a janela de aplicação (janela foi curta: ~poucos
  minutos, sem tráfego de escrita concorrente observado).
- **252 e 256 continuam pendentes** — fora do escopo desta autorização
  (usuário autorizou especificamente a 248). Mesmo plano de aplicação já
  documentado neste pacote continua válido para quando forem autorizadas.
- **Achado de drift de GRANT é sistêmico, não pontual:** o mesmo padrão
  (privilégio padrão do schema reconcede `EXECUTE` a `anon` na criação de toda
  função nova) provavelmente afeta outras migrations futuras que não incluam
  `REVOKE ... FROM anon` explícito (não basta `REVOKE ALL FROM PUBLIC`). Vale
  virar checklist padrão de toda migration que cria função nova destinada a
  `authenticated`/`service_role` apenas.

## 4. Débitos técnicos

Nenhum novo débito técnico introduzido. Os dois achados de grant foram
corrigidos na mesma sessão, versionados como migration própria (277), não
deixados como TODO.

## 5. Pendências reais (só o que depende de você)

- Autorizar aplicação de 252 (`venda_finance_context_mirror`, aditiva, baixo
  risco) e 256 (`pdv_diagnostico_pre_producao`, só função de diagnóstico,
  baixo risco) — não fazem parte do escopo desta rodada.
- Considerar, em paralelo (fora do escopo desta migration): confirmar via
  Dashboard se o plano Free do projeto `jinlong` deveria ser revisto antes do
  go-live, dado que não há PITR disponível para mutações de produção futuras.

## Conclusão

**Fase 2 (Estoque) está oficialmente 100% concluída — código e banco.** Não
há mais nenhuma pendência de Devolução/Troca. A Fase 3 (Financeiro) já estava
100% fechada anteriormente sem pendência externa. Próxima fase liberada para
início.
