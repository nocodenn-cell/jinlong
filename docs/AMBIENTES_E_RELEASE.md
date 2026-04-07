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

- [ ] **Migrations:** `migration list` remoto sem lacunas (incl. **014–018** onde houver sync desktop/caixa seguro e `validar-gerente`); smoke CI (`ci-backend-supabase` → job *migrations-smoke*) verde no commit.
- [ ] **Edge:** `sync-outbox` deployada com os **três** secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_KEY`) do projeto **alvo**; redeploy após mudanças na função (batch, `X-SYNC-KEY`, RPC de estoque).
- [ ] **Web:** `NEXT_PUBLIC_*` do mesmo `ref`; build sem erros; smoke manual em `/login` e fluxo crítico (ver P0 §4 ou §4b).
- [ ] **Desktop (se aplicável):** `.env` da loja com `SYNC_*` e `SUPABASE_*` do **ambiente alvo**; uma venda de teste + linha em `vendas` no projeto certo.
- [ ] **Rollback:** saber versão anterior da Edge (`functions deploy` / histórico) e ter `SYNC_KEY` anterior se precisar reverter secrets em conjunto.

---

## 4. CI relacionado

| Workflow | O que valida |
|----------|----------------|
| `ci-backend-supabase.yml` | Type-check Deno da Edge + **smoke SQL** das migrations |
| `ci-pdv-importados.yml` | Lint, testes, build; E2E opcional com secrets |
| `ci-pdv-local.yml` | Testes + build Vite do desktop |

---

## 5. Histórico / P0 operacional

Para fechamento operacional por projeto (incl. `verify_p0_producao.sql`), continue usando **[P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md)**. Este arquivo **complementa** com matriz de ambientes e política de credenciais do PDV local.
