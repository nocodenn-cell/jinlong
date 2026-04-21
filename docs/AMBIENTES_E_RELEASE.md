# Ambientes, credenciais do PDV local e gates de release

Documento da **Fase 2** do cronograma: alinhar **dev / staging / prod**, reduzir risco de credenciais no desktop e **bloquear release** sem checagens mínimas.

Referências: [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md), [CIRCUITO_OPERACIONAL.md](./CIRCUITO_OPERACIONAL.md).

---

## 1. Três ambientes (conceito)

| Ambiente   | Uso principal | Projeto Supabase | Deploy web |
|------------|---------------|------------------|------------|
| **dev**    | desenvolvimento local / experimentos | Projeto dedicado ou branch de dados | `localhost` / preview |
| **staging**| ensaio E2E, paridade com prod | Projeto **separado** (recomendado) | URL fixa de homologação |
| **prod**   | loja piloto / produção | Projeto **oficial** | Vercel/host produção |

**Regra:** não apontar `pdv-local` de loja física para o mesmo `ref` que você usa para testes destrutivos, a menos que seja consciente do risco.

---

## 2. PDV local — estratégia de credenciais

### Situação atual (MVP)

- **Sincronizar catálogo**, **pdv_config** e **outbox de vendas** usam a Edge `sync-outbox` com **`SYNC_ENDPOINT` + `SYNC_KEY`**.
- A `service_role` permanece somente no ambiente da Edge Function (servidor), nunca no app web nem no `pdv-local/.env`.

### Riscos e mitigações

- Tratar a máquina do PDV como **ambiente confiável**; restringir perfis de Windows e disco.
- **Rotacionar** `SYNC_KEY` se houver suspeita de vazamento e redeployar a Edge.
- Manter **`SYNC_KEY`** forte e igual ao secret da Edge; nunca versionar.

### Direção recomendada (próximo passo de segurança)

1. **Login operador no Tauri** + uso do **access token** do Supabase nas chamadas REST (papel `authenticated`), com RLS protegendo os dados **ou**
2. **Anti-replay forte** no sync (assinatura HMAC por payload, timestamp e nonce), reduzindo risco de reuso de requisições com `SYNC_KEY`.

---

## 3. Gates de release (antes de promover staging → prod)

Marque explicitamente (PR ou checklist interno):

- [ ] **Migrations:** `migration list` remoto sem lacunas (incl. **014–018** onde houver sync desktop/caixa seguro e `validar-gerente`; **024** anti-replay `sync_request_nonces`; **025** RPC `finalizar_venda_transacional_canonica_v2`); smoke CI (`ci-backend-supabase` → job *supabase-local-rls-smoke* / "Supabase local RLS smoke") verde no commit.
- [ ] **Edge:** `sync-outbox` deployada com os **três** secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_KEY`) do projeto **alvo**; redeploy após mudanças na função (HMAC, anti-replay, `op=catalogo` / `pdv_config` / `validar_gerente`, batch outbox, RPC v2). Secrets de rollout opcionais: `USE_UNIFIED_SALES_FLOW`, `CANARY_DEVICE_FINGERPRINTS`, `STRICT_MANAGER_DISCOUNT_AUTH` (ver §4).
- [ ] **Web:** `NEXT_PUBLIC_*` do mesmo `ref`; build sem erros; smoke manual em `/login` e fluxo crítico (ver P0 §4 ou §4b).
- [ ] **Desktop (se aplicável):** `.env` da loja com `SYNC_ENDPOINT` + `SYNC_KEY` do **ambiente alvo** (sem `service_role` no cliente); opcional `DEVICE_FINGERPRINT` alinhado ao canário; uma venda de teste + linha em `vendas` no projeto certo.
- [ ] **Rollback:** saber versão anterior da Edge (`functions deploy` / histórico) e ter `SYNC_KEY` anterior se precisar reverter secrets em conjunto.

---

## 4. Deploy `sync-outbox` e smoke test (passo a passo)

Use quando for fechar ou regredir o circuito desktop → nuvem com **HMAC**, **RPC v2** opcional e **desconto gerente** com token. Detalhe narrativo: [CIRCUITO_OPERACIONAL.md](./CIRCUITO_OPERACIONAL.md).

### 4.1 Banco (remoto)

1. No diretório `backend`, com projeto linkado: `npx supabase db push --linked`.
2. Confirmar presença das migrations **024** e **025** (nonces + RPC canônica v2).

### 4.2 Edge

1. `npx supabase functions deploy sync-outbox --no-verify-jwt` (a função usa `config.toml` com `verify_jwt = false`).
2. Secrets obrigatórios: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_KEY` (todos apenas no painel/CLI da Edge — **não** no `pdv-local/.env`).

### 4.3 Rollout do fluxo unificado (escolha uma estratégia)

| Fase | `USE_UNIFIED_SALES_FLOW` | `CANARY_DEVICE_FINGERPRINTS` | Comportamento |
|------|---------------------------|--------------------------------|---------------|
| Só legado | ausente / não `true` | vazio | Outbox chama `registrar_venda_com_itens` + baixa de estoque como antes. |
| Canário | ausente / não `true` | ex.: `loja-01-caixa-02` | Só dispositivos cujo `x-device-fingerprint` (normalizado lowercase) está na lista usam a RPC v2. |
| Pleno | `true` | ignorado (pode vazio) | Todas as vendas do outbox usam `finalizar_venda_transacional_canonica_v2`. |

Reaplique secrets após alterar: `npx supabase secrets set USE_UNIFIED_SALES_FLOW=true` (ou lista canária, etc.).

### 4.4 Desconto gerente estrito

1. Quando estiver pronto para exigir token no servidor: `STRICT_MANAGER_DISCOUNT_AUTH=true`.
2. No desktop, com rede, o fluxo **Desconto especial (gerente)** deve obter token via `POST ?op=validar_gerente` (mesmo `SYNC_KEY`/HMAC). Sem rede, o app ainda pode validar senha no cache local, mas o sync falhará se o estrito estiver ativo e não houver token.
3. Smoke: com estrito **ligado**, venda com desconto após validação online deve sincronizar; desconto aplicado só offline (sem token) deve ir para `failed` na outbox com erro relacionado a token.

### 4.5 Diagnóstico automatizado

```powershell
cd C:\Naturecode\fastproduct\backend
$env:SYNC_ENDPOINT = "https://SEU-REF.supabase.co/functions/v1/sync-outbox"
$env:SYNC_KEY = "(segredo)"
# Opcional — não commite; em CI use secret do pipeline:
# $env:SYNC_DIAG_GERENTE_SENHA = "(senha de teste do gerente)"
.\scripts\sync-outbox-anti-replay-diagnostic.ps1
```

Se `SYNC_ENDPOINT` / `SYNC_KEY` já estiverem em `pdv-local\.env` ou `backend\.env` (não versionados), o script tenta carregá-los automaticamente antes de falhar.

Com teste de `validar_gerente` (dois checks extras):

```powershell
.\scripts\sync-outbox-anti-replay-diagnostic.ps1 -ValidarGerenteSenha "(senha)"
```

### 4.6 Smoke manual no desktop

1. Preencher `pdv-local/.env` conforme `pdv-local/.env.example` (`SYNC_*` + opcional `DEVICE_FINGERPRINT` = canário).
2. Sincronizar catálogo e `pdv_config`.
3. Venda simples + Finalizar; conferir `vendas` no Supabase.
4. Se canário ou unificado + estrito: repetir com desconto de gerente (rede ligada para token).

---

## 5. CI relacionado

| Workflow | O que valida |
|----------|----------------|
| `ci-backend-supabase.yml` | Type-check Deno da Edge + **smoke SQL** das migrations; job opcional **`migration-remote-drift`** se existirem secrets `SUPABASE_ACCESS_TOKEN` + `SUPABASE_MIGRATION_CHECK_PROJECT_REF` (compara `migration list` ao repo; PRs de fork pulam) |
| `ci-pdv-importados.yml` | Lint, testes, build; E2E opcional com secrets |
| `ci-pdv-local.yml` | Testes + build Vite do desktop |

---

## 6. Histórico / P0 operacional

Para fechamento operacional por projeto (incl. `verify_p0_producao.sql`), continue usando **[P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md)**. Este arquivo **complementa** com matriz de ambientes e política de credenciais do PDV local.

**Registro por ciclo só em staging:** [CHECKLIST_P0_STAGING.md](./CHECKLIST_P0_STAGING.md) (tabelas com data/responsável/evidência). **Status Local vs Remote:** `cd backend` → `node scripts/p0-migration-status.mjs` (requer `supabase link`).
