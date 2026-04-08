# Checklist Final — Segurança Concluída (FastProduct)

Use este checklist para marcar **segurança concluída** por ambiente (`dev`, `staging`, `prod`).
Referência operacional complementar: [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md).

## 0) Governança do repositório (antes de merge/deploy)

- [ ] Nenhum arquivo versionado contém **URL real** de projeto Supabase, **`SYNC_KEY`** ou **`service_role`** (inclui scripts, relatórios JSON e docs de runbook).
- [ ] Relatórios de diagnóstico (ex.: anti-replay) ficam em `backend/artifacts/*.json` — pasta **ignorada pelo Git**; não adicionar esses JSONs com `git add -f`.
- [ ] Se algo sensível **chegou a ser commitado**: tratar como **vazamento potencial** — **rotacionar** `SYNC_KEY` (secrets da Edge), revisar **API keys** no painel Supabase conforme política do time e, se aplicável, limpar histórico (`git filter-repo`/BFG) com acompanhamento de compliance.
- [ ] Confirmar que **apenas a Edge** (e jobs server-side explícitos, ex.: seed local em `pdv-importados` com Node) usam `SUPABASE_SERVICE_ROLE_KEY`; **não** constar no **bundle cliente**, no **`pdv-local/.env` do desktop** nem em `.env` versionados.
- [ ] (Opcional) **pre-commit** com scanner de segredos (`gitleaks`, `trufflehog`, etc.) — o monorepo **não** versiona `.pre-commit-config.yaml`; configure por máquina ou adicione workflow de secret scanning no GitHub se o time exigir.

## 1) Critérios de aceite (go/no-go)

- [ ] `migration list` remoto alinhado até a última migration de segurança (`015` a `022`).
- [ ] Edge Functions `sync-outbox` e `validar-gerente` deployadas na versão atual.
- [ ] Secrets corretos no projeto alvo (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_KEY`).
- [ ] Fluxo de venda web usa RPC transacional (`finalizar_venda_transacional`) e estoque seguro (`decrementar_estoque_seguro`).
- [ ] Lockout de gerente ativo (`gerente_auth_attempts`) + rate-limit por escopo (`gerente_auth_rate_limits`) + tokens (`tokens_desconto_gerente`).
- [ ] Verificações SQL sem falhas (`verify_p0_producao.sql`, inclusive seções **11–12** após migrations **024–025**).
- [ ] Teste de abuso mínimo executado (itens abaixo).

## 2) Comandos CLI (executar por ambiente)

```powershell
cd C:\Naturecode\fastproduct\backend
npx supabase migration list
npx supabase db push
npx supabase functions deploy sync-outbox
npx supabase functions deploy validar-gerente
```

> Se você usa múltiplos projetos, rode `supabase link` para cada ambiente antes dos comandos acima.

## 3) SQL de validação rápida (cole no SQL Editor)

```sql
-- 3.1: Presença de objetos críticos
SELECT TO_REGCLASS('PUBLIC.TOKENS_DESCONTO_GERENTE') AS TOKENS_DESCONTO_GERENTE;
SELECT TO_REGCLASS('PUBLIC.GERENTE_AUTH_ATTEMPTS')   AS GERENTE_AUTH_ATTEMPTS;

-- 3.2: Privilégios RPCs críticas
SELECT HAS_FUNCTION_PRIVILEGE(
  'AUTHENTICATED',
  'PUBLIC.REGISTRAR_VENDA_COM_ITENS(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB, NUMERIC, NUMERIC, TEXT)',
  'EXECUTE'
) AS AUTH_REGISTRAR_VENDA_EXECUTE; -- esperado: FALSE

SELECT HAS_FUNCTION_PRIVILEGE(
  'SERVICE_ROLE',
  'PUBLIC.REGISTRAR_VENDA_COM_ITENS(UUID, UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB, NUMERIC, NUMERIC, TEXT)',
  'EXECUTE'
) AS SR_REGISTRAR_VENDA_EXECUTE; -- esperado: TRUE

SELECT HAS_FUNCTION_PRIVILEGE(
  'AUTHENTICATED',
  'PUBLIC.DECREMENTAR_ESTOQUE_SEGURO(UUID, NUMERIC, UUID)',
  'EXECUTE'
) AS AUTH_ESTOQUE_SEGURO_EXECUTE; -- esperado: TRUE

SELECT HAS_FUNCTION_PRIVILEGE(
  'SERVICE_ROLE',
  'PUBLIC.DECREMENTAR_ESTOQUE_SEGURO(UUID, NUMERIC, UUID)',
  'EXECUTE'
) AS SR_ESTOQUE_SEGURO_EXECUTE; -- esperado: TRUE

SELECT HAS_FUNCTION_PRIVILEGE(
  'AUTHENTICATED',
  'PUBLIC.FINALIZAR_VENDA_TRANSACIONAL(UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB, TEXT, NUMERIC)',
  'EXECUTE'
) AS AUTH_FINALIZAR_VENDA_TX_EXECUTE; -- esperado: TRUE
```

## 4) Teste funcional de segurança (aceite mínimo)

- [ ] **Preço adulterado no cliente**: servidor rejeita ou recalcula (venda não aceita valor fraudado).
- [ ] **Estoque concorrente**: duas vendas no último item -> uma falha com erro de estoque.
- [ ] **Gerente brute-force**: após 5 tentativas inválidas, retorna `429 LOCKED_TEMPORARILY`.
- [ ] **Rate-limit por escopo**: bloqueio por `USER`, `IP`, `DEVICE` e `GLOBAL` confirmado.
- [ ] **Role indevida**: JWT `authenticated` não executa `registrar_venda_com_itens`.
- [ ] **Governança P2**: auditoria RLS + pentest curto concluídos conforme [P2_GOVERNANCA_RLS_E_PENTEST.md](./P2_GOVERNANCA_RLS_E_PENTEST.md).
- [ ] **Smoke 023**: executar [backend/supabase/scripts/smoke_023_finalizar_venda_token_gerente.sql](../backend/supabase/scripts/smoke_023_finalizar_venda_token_gerente.sql) e anexar evidência.
- [ ] **Smoke 023 (copy/paste por ambiente)**: executar [backend/supabase/scripts/smoke_023_finalizar_venda_token_gerente_env.sql](../backend/supabase/scripts/smoke_023_finalizar_venda_token_gerente_env.sql) (DEV/STAGING) e anexar evidência.

## 5) Pendências para “segurança avançada” (não bloqueante do fechamento MVP)

- [ ] Migrar hash de senha de gerente de `SHA-256` para `ARGON2ID`/`BCRYPT`.
- [ ] Garantir rollout da sincronização via Edge (`SYNC_KEY` + HMAC) em todos os ambientes (sem `service_role` no `pdv-local/.env`).
- [x] Anti-replay no sync (HMAC + timestamp + nonce + persistência **024**): implementado no código e coberto por script/CI; **por ambiente**, ainda é preciso `db push`, deploy da Edge e secrets `SYNC_ENDPOINT`/`SYNC_KEY` no GitHub para o job validar o endpoint real.

---

## Status final por ambiente

- `DEV`: [ ] Concluído  
- `STAGING`: [ ] Concluído  
- `PROD`: [ ] Concluído  

**Regra de promoção:** só promover para o próximo ambiente quando todos os itens das seções 1–4 estiverem marcados no ambiente atual.
