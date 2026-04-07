# Checklist Final — Segurança Concluída (FastProduct)

Use este checklist para marcar **segurança concluída** por ambiente (`dev`, `staging`, `prod`).
Referência operacional complementar: [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md).

## 1) Critérios de aceite (go/no-go)

- [ ] `migration list` remoto alinhado até a última migration de segurança (`015` a `022`).
- [ ] Edge Functions `sync-outbox` e `validar-gerente` deployadas na versão atual.
- [ ] Secrets corretos no projeto alvo (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_KEY`).
- [ ] Fluxo de venda web usa RPC transacional (`finalizar_venda_transacional`) e estoque seguro (`decrementar_estoque_seguro`).
- [ ] Lockout de gerente ativo (`gerente_auth_attempts`) + rate-limit por escopo (`gerente_auth_rate_limits`) + tokens (`tokens_desconto_gerente`).
- [ ] Verificações SQL sem falhas (seções 6, 7, 8 e 9 do script de verificação).
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

## 5) Pendências para “segurança avançada” (não bloqueante do fechamento MVP)

- [ ] Migrar hash de senha de gerente de `SHA-256` para `ARGON2ID`/`BCRYPT`.
- [ ] Remover `SUPABASE_SERVICE_ROLE_KEY` do `pdv-local` (seguir `PLANO_RETIRADA_SERVICE_ROLE_PDV_LOCAL.md`).
- [ ] Adicionar anti-replay forte no sync (HMAC + timestamp + nonce).

---

## Status final por ambiente

- `DEV`: [ ] Concluído  
- `STAGING`: [ ] Concluído  
- `PROD`: [ ] Concluído  

**Regra de promoção:** só promover para o próximo ambiente quando todos os itens das seções 1–4 estiverem marcados no ambiente atual.
