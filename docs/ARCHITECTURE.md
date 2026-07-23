# Architecture Overview — FastProduct PDV System

**Version**: 1.0 (Post Go-Live P0)  
**Last Updated**: Jul 23, 2026  
**Scope**: Complete system architecture for offline-first retail PDV with sync

---

## 🏗️ High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        END USERS                                 │
├──────────────────────────┬──────────────────────────────────────┤
│                          │                                       │
│      PDV-LOCAL          │         PDV-IMPORTADOS                │
│      (Tauri Desktop)     │         (Next.js Web)                 │
│                          │                                       │
│  • Offline-first PDV     │  • Web dashboard (gerente)            │
│  • Barcode scanning      │  • Admin panel                        │
│  • Local inventory sync  │  • Real-time sales feed               │
│  • Full transactions     │  • Reporting & analytics              │
│                          │                                       │
└──────────────┬───────────┴────────────┬──────────────────────────┘
               │ HMAC-signed sync       │
               │ (outbox pattern)       │
               │                        │
┌──────────────▼────────────────────────▼──────────────────────────┐
│                                                                   │
│        BACKEND (Supabase + Edge Functions)                       │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ PostgreSQL Database (RLS enabled)                       │   │
│  │  • vendas, itens, caixas, estoque, ...                  │   │
│  │  • Row-level security policies per usuario/loja         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Edge Functions (Deno Runtime)                           │   │
│  │  • sync-outbox: receive events from PDVs               │   │
│  │  • validar-gerente: manager auth + tokens              │   │
│  │  • fiscal-worker: NF-e enqueue                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Auth (Supabase Auth + Custom tokens)                    │   │
│  │  • User signup/login (email + password)                │   │
│  │  • Role-based access (operador, gerente, admin)         │   │
│  │  • Manager token generation (time-limited)              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Monitoring & Observability                              │   │
│  │  • Sentry (error tracking + source maps)               │   │
│  │  • Edge function logs                                   │   │
│  │  • RLS policy enforcement logs                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📦 Monorepo Workspace Structure

### 1. **pdv-importados** (Next.js Web App)
**Purpose**: Manager dashboard + admin panel (web-only)

**Key Features**:
- Real-time sales feed (synced from desktop)
- Inventory management
- Manager dashboard & analytics
- Admin functions (users, promotions, etc.)
- Authentication & role-based access

**Tech Stack**:
- Next.js 15+ (App Router, Server Components)
- React 18+ (Client Components for interactive UI)
- Tailwind CSS + shadcn/ui (components)
- Supabase JS client (auth + database queries)
- Sentry (error tracking)
- Vitest (unit tests)
- Playwright (E2E tests)

**Key Paths**:
- `/app/caixa` — **Not accessible** on web (desktop only)
- `/app/gerente` — Manager dashboard
- `/app/admin` — Admin functions
- `/auth` — Authentication flows

---

### 2. **pdv-local** (Tauri Desktop App)
**Purpose**: Offline-first retail PDV (cashier terminal)

**Key Features**:
- Barcode scanning & product lookup
- Shopping cart & checkout
- Offline transactions (syncs when online)
- Cash register open/close
- Local inventory tracking

**Tech Stack**:
- Tauri (Rust + TypeScript)
- React 18+ (UI layer)
- SQLite (local database, offline)
- Axios (HTTP for sync)
- React Query (data sync)

**Architecture**:
- Offline-first: All data cached locally
- Sync on demand: Batch sync via sync-outbox API
- No backend dependency: Can operate 100% offline
- HMAC authentication: Sync requests signed with shared secret

---

### 3. **backend** (Supabase + Edge Functions)
**Purpose**: Data persistence, sync orchestration, compliance

**Key Services**:
1. **PostgreSQL Database** (Supabase Postgres)
   - Single source of truth for all data
   - Row-level security (RLS) policies
   - Real-time subscriptions for web app

2. **Edge Functions** (Supabase Edge, Deno runtime)
   - `sync-outbox`: Accepts batched events from desktop/PDVs
   - `validar-gerente`: Manager token generation
   - `fiscal-worker`: NF-e document enqueue

3. **Auth** (Supabase Auth)
   - JWT tokens for web app
   - Custom tokens for manager (time-limited)
   - RLS policies enforced per user

---

### 4. **shared-core** (TypeScript Business Logic)
**Purpose**: Code shared across web + desktop (no duplicated logic)

**Key Modules**:
- `/pricing` — Price calculation (varejo/atacado rules)
- `/inventory` — Stock calculations
- `/pdv` — Sales state machine, invariants
- `/financial` — Payment modes, discounts
- `/customers` — Client data validation

**Constraint**: No React, no UI. Pure TypeScript/Node.js logic.

---

## 🔄 Core Data Flows

### Sale Flow (Happy Path)

```
PDV-LOCAL (Desktop)
  1. Operador scans barcode
  2. System looks up product (local cache)
  3. Add to cart (update local state)
  4. Operador finalizes sale
  5. System saves to local SQLite
  6. System signs + sends to backend
        ↓
BACKEND (Supabase Edge)
  7. Validate signature (HMAC-SHA256)
  8. Check replay (nonce table)
  9. Store event in outbox_events
 10. Process event → INSERT into vendas
        ↓
PDV-IMPORTADOS (Web)
 11. Real-time listener (Supabase subscribe)
 12. Fetch new sale from RPC
 13. Display in gerente dashboard
```

**Data Consistency Guarantee**:
- Desktop writes to local DB immediately (user sees confirmation)
- Backend processes async (eventually consistent)
- Web updates via real-time subscription (<2s lag typical)

---

### Sync Mechanism (HMAC + Outbox)

**Why Outbox Pattern?**
- Decouples write from async processing
- Survives backend transient failures
- Enables replay/retry semantics
- Prevents "sync succeeded but RPC failed" inconsistency

**Flow**:
```
Desktop                                Backend
  │
  ├─ Build event (VENDA_REGISTRADA)
  │   └─ Sign with HMAC-SHA256(SYNC_KEY, ts.nonce.device.body)
  │
  ├─ POST /sync-outbox
  │   Headers: X-SYNC-KEY, X-SYNC-TS, X-SYNC-NONCE, X-SYNC-SIGNATURE
  │   Body: {events: [{id, tipo, payload_json}]}
  │         │
  │         ├─ Validate signature (timing-safe comparison)
  │         ├─ Check nonce not replayed (SELECT FROM sync_request_nonces)
  │         ├─ Insert event to outbox_events
  │         ├─ Process event → INSERT vendas (atomic)
  │         └─ Return 200 + {processed: [id1, id2], failed: []}
  │
  └─ Retry failed events (exponential backoff, max 3 retries)
```

**Security Model**:
- Signature validates authenticity (no tampering)
- Nonce prevents replay attacks (10min TTL)
- Device fingerprint (IP, user-agent) adds entropy
- Service role used only in Edge Function (never exposed)

---

## 🔐 Security Architecture

### Authentication Layers

```
                   WEB (pdv-importados)       DESKTOP (pdv-local)
                          │                         │
                          ├─ Supabase Auth         ├─ No login needed
                          │  (email + password)     │  (local-only)
                          │                         │
                          ├─ JWT token             ├─ On sync: Generate
                          │  (valid ~1h)           │  manager token
                          │                         │
                          └─ RLS policies          └─ Verify with backend
                             (row access)           (HMAC signature)
```

### Authorization (RLS)

Row-level security enforced at database level:

```sql
-- Example: vendas table
CREATE POLICY "users see their store's sales"
  ON vendas
  FOR SELECT
  USING (loja_id = auth.user_metadata->>'loja_id');

-- Manager sees ALL stores (service role bypass in Edge Function)
-- Operador sees only their cash register's sales
```

**Guarantee**: Even if auth middleware bypassed, database enforces access control.

---

### Secret Management

```
SAFE (never exposed to client):
├─ Supabase service role key (Edge Functions only)
├─ SYNC_KEY (HMAC secret)
├─ Sentry auth token
└─ Database connection strings

CLIENT-SAFE (public):
├─ NEXT_PUBLIC_SUPABASE_URL (API endpoint)
├─ NEXT_PUBLIC_SUPABASE_ANON_KEY (limited permissions)
└─ SENTRY_DSN (client-side error reporting)

LOCAL (desktop):
├─ SYNC_ENDPOINT (Edge Function URL)
├─ SYNC_KEY (read from secure storage)
└─ DEVICE_FINGERPRINT (generated once, stored locally)
```

---

## 📊 Scalability Considerations

### Current Architecture Limits

| Component | Current Capacity | Bottleneck |
|-----------|------------------|-----------|
| PDVs | ~50 concurrent | Sync throughput (HMAC verification) |
| Web connections | ~1000 concurrent | Supabase real-time subscriptions |
| Database | ~100k transactions/day | Postgres row locking during RPC |
| Edge Functions | ~100 req/s | Deno startup cold-start (50-100ms) |

### Scaling Strategy (Future)

1. **Sync Service** (dedicate service for HMAC validation)
2. **Read Replicas** (split read-heavy queries)
3. **Event Processing** (Kafka for eventual consistency)
4. **Cache Layer** (Redis for catalog/prices)

---

## 🎯 Design Decisions (ADRs)

### ADR-001: Monorepo with Turbo
**Status**: Accepted  
**Rationale**: Shared business logic, coordinated releases  
**Tradeoff**: Complex dependency management, but better code reuse

### ADR-002: Offline-First Desktop App
**Status**: Accepted  
**Rationale**: Retail environments have spotty connectivity  
**Tradeoff**: Complex sync protocol, eventual consistency model

### ADR-003: Sync via HMAC + Outbox
**Status**: Accepted  
**Rationale**: Stateless, replay-resistant, survives failures  
**Tradeoff**: No ordering guarantees (handled by deduplication)

### ADR-004: RLS + Service Role
**Status**: Accepted  
**Rationale**: Defense-in-depth, compliance-ready  
**Tradeoff**: Complexity in policy definitions, testing burden

### ADR-005: Next.js App Router + Server Components
**Status**: Accepted  
**Rationale**: Better SEO, reduced client-side JS, faster first load  
**Tradeoff**: Learning curve, limited client state patterns

---

## 🧪 Testing Strategy

### Unit Tests (Vitest)
```
shared-core/              ✅ 173 tests (pricing, inventory, PDV logic)
pdv-importados/           ✅ 507 tests (UI, hooks, utilities)
pdv-local/                ✅ 57 tests (sync, offline cache)
```

### E2E Tests (Playwright)
```
Critical Path (must pass before production):
  ✅ caixa-venda.spec.ts           — Sale finalization
  ✅ caixa-fluxos-criticos.spec.ts — Cash register cycle
  ✅ sync-fluxo-gerente.spec.ts    — Desktop→Web sync
```

### Smoke Tests (Post-Deploy)
```
7-test checklist (docs/GO-LIVE-RUNBOOK.md)
  1. Login (operador + gerente)
  2. Product search & add
  3. Sale finalization
  4. Gerente sync visibility
  5. Caixa open/close
  6. Sentry integration
  7. Vercel analytics
```

---

## 📈 Observability

### Error Tracking (Sentry)
- **Client-side**: RSC and Server Actions errors
- **Server-side**: Edge Function exceptions
- **RLS violations**: Logged + alerted
- **Sync failures**: Tracked by event type

### Performance Monitoring
- **Web**: Vercel Analytics (LCP, FID, CLS)
- **API**: Edge Function latency per operation
- **Database**: Slow query logs (Supabase)

### Health Checks
- `/api/health` endpoint (Vercel)
- Sync nonce table (DB health)
- Sentry dashboard (error rate)

---

## 🔄 Deployment & Release

### Environments

```
                 Development          Staging              Production
                 ───────────          ───────              ──────────
pdv-importados   localhost:3000       Vercel preview       vercel.app
pdv-local        Debug build          Staging DB           Production DB
backend          Local Supabase       Staging Supabase     Production Supabase
```

### CI/CD Pipeline
1. **Commit** → GitHub push
2. **Build** → Vercel auto-deploys preview
3. **Test** → GitHub Actions (lint, typecheck, unit tests)
4. **E2E** → Playwright on staging (manual trigger)
5. **Deploy** → Merge to main (Vercel auto-prod)

See `docs/GO-LIVE-RUNBOOK.md` for detailed deployment procedures.

---

## 🚨 Known Limitations & Future Work

### Current Limitations
- No offline support for gerente dashboard (web-only)
- Manual cash register reconciliation (no auto-close)
- Limited reporting (real-time only, no historical trend analysis)
- Single-region deployment (no disaster recovery)

### Future Enhancements
- [ ] Global sync service (multi-region)
- [ ] Advanced reporting & BI
- [ ] Automated reconciliation
- [ ] Mobile-responsive PDV (in addition to desktop)
- [ ] Offline manager dashboard (cached)

---

## 📚 Related Documents
- `CONTRIBUTING.md` — Development standards
- `docs/DECISION-LOG.md` — Detailed ADRs
- `docs/GO-LIVE-RUNBOOK.md` — Deployment procedures
- `docs/POST-DEPLOY-MONITORING.md` — Monitoring checklist

---

**Questions?** Open GitHub issue or contact architecture team.
