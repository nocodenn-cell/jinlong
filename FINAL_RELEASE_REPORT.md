# FastProduct — Final Release Report (Release Candidate)

**Data:** 2026-07-16
**Papéis:** Principal Engineer · Product Owner · QA Lead · Release Manager
**Escopo:** auditoria e reconciliação de **código, infraestrutura, configuração, deploy, banco e observabilidade** contra a nuvem real (Vercel + Supabase + GitHub), sem alterações destrutivas.
**Método:** evidência real coletada via suíte de testes, guards, e dashboards (MCP Vercel/Supabase). Nenhum secret exibido; nenhuma mutação de produção aplicada.

Documentos irmãos: `RELEASE_CANDIDATE_CHECKLIST.md`, `RISK_REGISTER.md`, `DEPLOY_ORDER.md`, `ROLLBACK_PLAN.md`, `docs/AUDITORIA_AMBIENTES_PRODUCAO.md`, `docs/AUDITORIA_COMPLETUDE_MODULOS.md`.

---

## 1. Veredito

**Núcleo transacional PRODUCTION-READY.** Go-live final **gated por 2 itens operacionais**, não por defeito de código:
1. **Banco:** confirmar/aplicar migrations do repo ainda não presentes no ledger de produção (248, 250–253, 256) — requer sua confirmação (mutação de produção).
2. **Config:** confirmar variáveis nos cofres Vercel/GitHub (valores não legíveis por API) e limpar 4 nomes órfãos.

Todos os portões automatizados estão **verdes**. `ageguard` (2ª autoridade) está **INACTIVE** — risco de divergência **latente, não ativo**.

---

## 2. As 6 dimensões — auditadas e reconciliadas

### 2.1 Código — 🟢 reconciliado
| Evidência | Resultado |
|---|---|
| Testes (web+shared-core+desktop) | **663 passed / 0 fail / 0 skip** |
| Typecheck | limpo (exit 0) |
| Guards arquiteturais (`guard:all`) | **7/7 OK** |
| `guard:core` (regra de negócio na UI) | OK |
| `guard:rpc` (fluxo de venda único) | OK — v4 (web) / `registrar_venda_com_itens` (local) |
| TODO/FIXME em core/lib | 0 |
| Dívida arquitetural | UI dupla `/gerente` ↔ Admin V2 (§4) — rastreada, gate de validação |

### 2.2 Infraestrutura — 🟢 reconciliado
| Recurso | Estado |
|---|---|
| Supabase `jinlong` (`kbabmewnahysfvlybiak`, sa-east-1) | **ACTIVE_HEALTHY** · Postgres 17.6 |
| Supabase `ageguard` (`dusngyacduoihxhkqmhv`, us-west-2) | **INACTIVE** (mesma org) |
| Edge `sync-outbox` v68 | ACTIVE · `verify_jwt=false` (auth por `SYNC_KEY`) |
| Edge `validar-gerente` v43 | ACTIVE · `verify_jwt=true` |
| Edge `fiscal-worker` v35 | ACTIVE · `verify_jwt=false` (auth por `FISCAL_WORKER_KEY`) |
| Vercel projeto `pdv-importados` (team `jinlong`) | ativo · Node 24.x |

### 2.3 Configuração — 🟡 reconciliado c/ pendência de cofre
- Autoridade única por camada definida (Vercel / Supabase Edge+Custom / GitHub Actions / `.env` desktop) — `docs/AUDITORIA_AMBIENTES_PRODUCAO.md`.
- **Todo env var lido no código mapeia para var real** — 0 referências a variáveis inexistentes; 0 shims de compat obsoletos encontrados.
- **4 nomes órfãos** (0 uso no repo) classificados (não removidos): `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SB_SERVICE_ROLE`, `SYNC_OUTBOX_SECRET`, `SYNC_GATE_SECRET`.
- Valores de cofre (Vercel Env / GitHub Secrets) **não legíveis por API** → checklist de dashboard (§5 daquele doc).

### 2.4 Deploy — 🟢 reconciliado
| Item | Evidência |
|---|---|
| **Produção atual** | commit **`8deb540`** (#193, `feat(caixa): Onda 1 keyboard-first`) — **READY**, `target=production` |
| Produção == `main` HEAD | **Sim** (`origin/main` = `8deb540`) — sem drift repo↔prod |
| Rollback candidate disponível | `c41f241` (#190) e `e2150724` (#196) marcados |
| PRs #190–#196 | todos deployados em produção com sucesso |
| PR #198 (auditorias) | Preview READY (target null) — **não** promovido a produção |

### 2.5 Banco — 🟡 drift identificado (requer confirmação)
- **Ledger de produção:** 18 migrations rastreadas, última `ajustar_estoque_manual_service_ator` (2026-07-14).
- **Drift repo↔produção:** o repo tem 193 arquivos de migration; várias **não aparecem no ledger de produção**, incluindo **248 (devolução/troca), 250, 251, 252, 253, 256**. → aplicação pendente (mutação — requer sua confirmação).
- **Numeração não-autoritativa:** prefixos numéricos duplicados (dois `259`, dois `268`) e nomes do ledger divergem do prefixo do arquivo (ex.: `255`, `269`→sem prefixo no ledger). **Timestamp é a ordem real**; `guard:migrations` local = OK (sem colisão pela regra de timestamp).
- **Migrations de risco:** ver `RISK_REGISTER.md` (248 altera estoque+caixa+ledger; 268 dropa overloads de RPC — ordem importa, ver `DEPLOY_ORDER.md`).

### 2.6 Observabilidade / Segurança — 🟡 sem bloqueador, itens conhecidos
- **Sentry:** configs `client/server/edge` no repo; `SENTRY_DSN` a confirmar no cofre de produção.
- **Advisors de segurança (jinlong):** 114 — **0 ERROR**, 112 WARN + 2 INFO. Destaques: 33× função `SECURITY DEFINER` executável por `anon` (revisar), 74× por `authenticated`, 1× *leaked password protection* desligado (toggle de dashboard), 2× RLS habilitado sem policy (`gerente_auth_attempts` + 1).
- **Advisors de performance:** 266 — **0 ERROR**. 138 multiple-permissive-policies, 97 índices não usados, 21 `auth_rls_initplan` (otimizável), 10 FKs sem índice. Tudo classe-otimização, **não bloqueante**.

---

## 3. O que foi executado nesta sprint (sem dashboards destrutivos)
- Auditoria de ambientes (`docs/AUDITORIA_AMBIENTES_PRODUCAO.md`) — matriz LOCAL vs CLOUD, Supabase Project Authority, propostas P1–P9.
- Auditoria de completude de módulos (`docs/AUDITORIA_COMPLETUDE_MODULOS.md`) — 12 módulos, DoD, backlog.
- Reconciliação com nuvem real (este relatório) — Vercel deploys, Supabase projetos/edge/migrations/advisors.
- 5 entregáveis de Release Candidate.

**Nenhuma mutação de produção** (Vercel/Supabase/GitHub) foi aplicada. Nenhum secret exibido.

---

## 4. Dívida arquitetural rastreada — UI dupla `/gerente` ↔ Admin V2
5 page-clients `@legacy` (compras, financeiro, produtos, relatorios, vendas) migrados para Admin V2 mas **ainda vivos** (nav própria `GerenteHeaderNav`, cross-links). **Não é código morto** → consolidação com gate por módulo, não delete cego. P2 no backlog.

---

## 5. Conclusão
FastProduct está em estado de **Release Candidate**: código/infra/deploy verdes e reconciliados; banco e config com pendências **operacionais conhecidas e documentadas**, todas exigindo sua confirmação explícita por serem mutações de produção. Ver a lista consolidada de intervenção humana ao final da conversa e em `RELEASE_CANDIDATE_CHECKLIST.md`.
