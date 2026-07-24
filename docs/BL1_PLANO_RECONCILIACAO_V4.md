# BL-1 — Plano Técnico: Reconciliação da RPC `finalizar_venda_transacional_canonica_v4`

**Status**: 📋 PLANO PARA A PRÓXIMA SPRINT — decisão arquitetural pendente. **Nada implementado.**
**Data**: 2026-07-24
**Pré-leitura**: `docs/AUDITORIA_HISTORICA_RPC_V4_DESCONTOS.md` (laudo) · `docs/RECONCILIACAO_REPO_VS_BANCO_DESCONTOS.md` (divergência repo↔banco)

## Problema (resumo)
A v4 viva (a) **não consome** o token de gerente (`usado` nunca vira `true` → token reutilizável, P0) e (b) **não registra** `descontos_venda` (sem auditoria, P0). Além disso, `descontos_venda` viva tem só 4 colunas (falta `operador_id`/`aplicado_em`) e não há coluna de `motivo` (MVF #2).

---

## 1. Estratégia de reconciliação

**Uma única migration timestamped, idempotente, contra o estado REAL do banco.**

1. **Schema `descontos_venda`** (`ADD COLUMN IF NOT EXISTS`): `operador_id`, `aplicado_em`, `motivo_desconto` (ENUM `motivo_desconto_enum_tipo`), `motivo_descricao_livre` + CHECK (`OUTROS` ⇒ descrição) + índice por motivo.
2. **Corpo da v4**: materializar do `pg_get_functiondef` vivo (corpo `268`, 19 args) e reintroduzir o **PASSO 5** logo após registrar pagamentos e antes do event/fiscal:
   - `UPDATE tokens_desconto_gerente SET usado = true WHERE token = … AND usado = false;` + `IF NOT FOUND THEN RAISE 'TOKEN_GERENTE_JA_USADO'`.
   - `INSERT INTO descontos_venda (…, operador_id, aplicado_em, motivo_desconto, motivo_descricao_livre)` com `ON CONFLICT (venda_id) DO UPDATE`.
3. **Assinatura**: `DROP` do overload de 19 args + `CREATE` com 21 args (novos `p_motivo_desconto DEFAULT 'NAO_ESPECIFICADO'`, `p_motivo_descricao DEFAULT NULL`). Mantém overload único (evita ambiguidade PostgREST).
4. **App**: `caixaVendas.impl.ts` passa `p_motivo_desconto`/`p_motivo_descricao` (já capturados na UI).
5. **Fora de escopo BL-1**: enqueue fiscal rico (BL-3) — não misturar.

**Princípio**: preserva SSOT (uma única v4; corpo `268` intacto no restante) e a política de não acúmulo (nenhuma mudança em precedência).

---

## 2. Impacto esperado
- ✅ Token de gerente passa a ser de uso único (fecha P0 de segurança).
- ✅ Todo desconto de gerente gera linha auditável com operador, timestamp e motivo (fecha P0 de compliance + conclui MVF #2 end-to-end).
- ✅ Fluxo dourado (`venda-golden-flow.md`) volta a bater com o comportamento vivo.
- ⚙️ Assinatura da RPC muda (19→21 args): exige deploy coordenado app+banco.

---

## 3. Riscos
| Risco | Sev. | Mitigação |
|---|---|---|
| Recriar corpo de 330 linhas introduz diff acidental | Alta | Materializar do `pg_get_functiondef` vivo; diff linha a linha; só os 2 blocos novos |
| Ambiguidade PostgREST por overload duplicado | Média | `DROP` explícito do overload de 19 args antes do `CREATE` |
| App chamar assinatura antiga durante janela de deploy | Média | Params novos têm DEFAULT → compatível; deploy banco antes do app |
| `descontos_venda` legado sem `motivo` viola CHECK | Baixa | Colunas novas com DEFAULT `NAO_ESPECIFICADO`; CHECK só exige descrição p/ `OUTROS` |
| Reconciliação aplicada no ambiente errado | Alta | Confirmar formalmente que `jinlong` é o alvo antes de aplicar |

---

## 4. Rollback
- **Função**: reaplicar o corpo `268` vivo (sem PASSO 5) + restaurar overload de 19 args — snapshot do `pg_get_functiondef` guardado antes da migration.
- **Schema**: colunas são aditivas (`ADD COLUMN`); rollback opcional via `DROP COLUMN IF EXISTS` (dados de auditoria seriam perdidos — preferir manter).
- **App**: reverter o commit que envia `p_motivo_*` (params têm DEFAULT, então app antigo continua funcionando mesmo com a função nova).
- Rollback é seguro: função é substituível e colunas não quebram inserts existentes.

---

## 5. Testes necessários
- **SQL/unit**: token vira `usado=true`; segundo uso do mesmo token → `TOKEN_GERENTE_JA_USADO`; `INSERT descontos_venda` com motivo; CHECK rejeita `OUTROS` sem descrição.
- **Integração**: `finalizar_venda…v4` com token+motivo persiste linha correta; sem token não grava desconto.
- **E2E**: fluxo gerente 3 passos → finalizar → confirmar na timeline de auditoria (tarefa S1.12 do plano executivo).
- **Regressão**: vendas sem desconto e split payment inalteradas; `contas_receber` (Fase 5b) intacto.
- **Verificação pós-deploy**: `pg_get_functiondef` contém `SET usado` + `INSERT … descontos_venda`.

---

## 6. Ordem de execução
1. Confirmar ambiente-alvo (`jinlong` prod vs staging).
2. Snapshot do `pg_get_functiondef` vivo (rollback).
3. Escrever migration timestamped (schema + corpo v4 com PASSO 5 + assinatura 21 args).
4. Aplicar em staging → rodar testes SQL/integração/E2E.
5. Deploy banco → deploy app (`caixaVendas.impl.ts` com `p_motivo_*`).
6. Verificação pós-deploy + E2E de auditoria.
7. Atualizar `AUDITORIA_DRIFT` e adicionar guard de drift por corpo (BL-4).

---

**Decisão pendente**: aprovar esta estratégia (migration única, corpo `268` + PASSO 5 + motivo) antes de qualquer implementação na próxima sprint.
