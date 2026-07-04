# Architecture Guidelines — Product Domain Consolidation

## 1. Consolidated Structure

All product-related domain logic is now consolidated in a single location:

```
shared-core/src/domain/product/
├── types.ts                          # StatusPublicacao, ProdutoOrigem, OrigemProduto, UnidadeMedida
├── engine.ts                         # All product rules and transformations
├── requests/
│   ├── CadastroData.ts              # Product registration request contract
│   └── ContextoApp.ts               # Application execution context contract
```

### Single Source of Truth

**StatusPublicacao** — ONLY defined in `shared-core/src/domain/product/types.ts`
- Type: `'DRAFT' | 'PUBLICADO' | 'INATIVO'`
- Never duplicated or re-defined elsewhere
- Re-exported via `pdv-importados/core/ports/produto.ts` for backwards compatibility

**Product Rules** — ONLY in `shared-core/src/domain/product/engine.ts`
- `PRODUCT_RULES` constant (declarative config)
- `evaluateProduct()` — vendability decision
- `statusInicialProduto()` — creation status
- Transformation functions: `ativoFromStatusPublicacao()`, `dualWriteFromStatus()`, etc.
- Never reimplemented in multiple places

---

## 2. Dependency Direction Rules

### ALLOWED IMPORTS

```
shared-core/src/domain/product/
  ↓ (no imports from anything — foundation layer)

shared-core/src/pricing/
  ↓ CAN import from
  → shared-core/src/domain/product/

shared-core/src/catalog/
  ↓ CAN import from
  → shared-core/src/domain/product/
  → shared-core/src/engine/ (legacy compatibility wrapper)

pdv-importados/app/aplicacao/
  ↓ CAN import from
  → @shared-core/ (domain, pricing, catalog)
  → ../infraestrutura/ (persistence interfaces)

pdv-importados/core/services/
  ↓ CAN import from
  → @shared-core/
  → ../app/aplicacao/
  → ./catalog/
  → ./ports/

pdv-importados/app/gerente/
  ↓ CAN import from
  → @shared-core/
  → ../app/aplicacao/
  → ../core/services/
  → ../lib/adapters/
```

### FORBIDDEN IMPORTS

```
❌ shared-core/ imports from pdv-importados (NEVER)
❌ pdv-importados/app/ imports from pdv-importados/core/ (except types via ports)
❌ pdv-importados/core/ imports back to pdv-importados/app/
❌ Application layer imports Persistence directly (only via interface)
❌ Domain/types files importing from Application/Persistence layers
❌ Any circular dependencies
```

---

## 3. Layer Responsibilities

### Domain Layer (shared-core/src/domain/product/)
**What it does:**
- Defines product types (StatusPublicacao, OrigemProduto, UnidadeMedida)
- Implements vendability rules (evaluateProduct)
- Status transitions (statusInicialProduto)
- Transformation functions (ativoFromStatusPublicacao, dualWriteFromStatus)

**What it NEVER does:**
- React/UI logic
- Database access
- External API calls
- Side effects

### Application Layer (pdv-importados/app/aplicacao/)
**What it does:**
- Receives: PolicyInput (pricing) + CadastroData (registration) + ContextoApp (context)
- Calls domain services (PricingPolicyService)
- Builds RPC requests with no reinterpretation
- Calls repository to execute persistence

**What it NEVER does:**
- Reimplements domain rules
- Directly imports core/catalog business logic
- Direct database operations (only via Repository interface)

### Persistence Layer (pdv-importados/app/infraestrutura/)
**What it does:**
- Implements repository interfaces
- Executes RPC requests unchanged
- Maps domain/application types to persistence operations

**What it NEVER does:**
- Business logic or validation
- Domain/application logic reinterpretation
- Direct SQL (only RPC through database functions)

---

## 4. Type Consolidation Guidelines

### Request/Input Types
**Location:** `shared-core/src/domain/product/requests/`
- **CadastroData** — all product registration fields (nome, codigo_barras, etc.)
- **ContextoApp** — execution context (lojaId, source, userId)
- **PolicyInput** — pricing-specific fields (preco_varejo, preco_atacado, etc.)

**Rule:** Request types belong in shared-core, not in application layer
- They are contracts between layers
- They must be accessible from all layers
- Never define them in app/aplicacao/

### Domain Types
**Location:** `shared-core/src/domain/product/types.ts`
- **StatusPublicacao** — enumeration of product states
- **ProdutoOrigem** — how product was created (human | import)
- **OrigemProduto** — legacy supplier origins (china_manual | brasil_nf | brasil_sem_nf)
- **UnidadeMedida** — measurement units (UN | KG | CX | FD | M)

**Rule:** Domain types are immutable constants, never scattered
- One definition per concept
- Re-export only via official channels (ports/produto.ts)
- Never create parallel definitions

---

## 5. Critical Patterns to Enforce

### ✓ CORRECT: Import + Export Pattern

```typescript
// pdv-importados/core/ports/produto.ts
import type { StatusPublicacao } from '@shared-core/src/domain/product/types'

// ✓ CORRECT: explicit import + export
export type { StatusPublicacao }
```

### ❌ WRONG: Direct Re-export in Same File

```typescript
// ❌ BROKEN: TypeScript cannot resolve this for use in same file
export { type StatusPublicacao } from '@source'

interface NovoProdutoInput {
  status?: StatusPublicacao  // ← "Cannot find name" error
}
```

### ✓ CORRECT: Re-export Wrapper

```typescript
// pdv-importados/core/catalog/statusPublicacao.ts
// When consolidating, keep old file as pure re-export wrapper
export {
  ativoFromStatusPublicacao,
  statusFromAtivoLegacy,
  dualWriteFromStatus,
  // ... all functions
} from '@shared-core/src/domain/product/engine'
```

---

## 6. Backwards Compatibility

### Deprecated Locations (still accessible via re-export)
- `shared-core/src/engine/productEngine.ts` → re-exports from domain/product/engine
- `pdv-importados/core/catalog/statusPublicacao.ts` → re-exports from domain/product/engine
- `pdv-importados/core/ports/produto.ts` → re-exports domain types

**Why?** Allow gradual migration of existing code without breaking it.

### New Code Should Import From
```typescript
// ✓ New imports (preferred)
import { evaluateProduct } from '@shared-core/src/domain/product/engine'
import type { StatusPublicacao } from '@shared-core/src/domain/product/types'
import type { CadastroData } from '@shared-core/src/domain/product/requests/CadastroData'

// ✓ Also acceptable (via re-export)
import type { StatusPublicacao } from '@/core/ports/produto'

// ✗ Avoid (old scattered locations)
import { statusInicialProduto } from '@/core/systemRules'
```

---

## 7. Preventing Future Regressions

### Before Committing
1. **No duplicate type definitions:** Search codebase for StatusPublicacao, CadastroData, etc.
2. **No scattered business logic:** All product rules in domain/product/engine.ts
3. **Correct import patterns:** Use `import type { X }; export type { X }` pattern
4. **No layer violations:** Application doesn't import from core/catalog

### Test Validation
```bash
npm run build      # TypeScript compilation check
npm run test       # Unit + integration tests
```

### CI Checks
- TypeScript compiler in strict mode
- No circular dependency detection (eslint-plugin-import)
- No forbidden import patterns (custom linter rules)

---

## 8. Common Mistakes to Avoid

### ❌ Creating Parallel Type Definitions
```typescript
// WRONG: Multiple definitions of same concept
// File 1: shared-core/src/engine/productEngine.ts
export type StatusPublicacao = 'DRAFT' | 'PUBLICADO' | 'INATIVO'

// File 2: pdv-importados/app/aplicacao/types/CadastroData.ts
export type StatusPublicacao = 'DRAFT' | 'PUBLICADO'  // DUPLICATE!

// File 3: pdv-importados/core/catalog/statusPublicacao.ts
const STATUS_OPTIONS = ['DRAFT', 'PUBLISHED']  // WRONG VALUES!
```

### ✓ Correct: Single Definition + Re-export
```typescript
// Single definition
export type StatusPublicacao = 'DRAFT' | 'PUBLICADO' | 'INATIVO'

// Everywhere else: import + use (or re-export)
import type { StatusPublicacao } from '@shared-core/src/domain/product/types'
export type { StatusPublicacao }
```

### ❌ Application Layer Duplicating Domain Logic
```typescript
// WRONG: Domain rule in Application layer
export function isVendavel(product: any) {
  return product.ativo && product.status === 'PUBLICADO'
}

// This is already in domain/product/engine.ts!
```

### ✓ Correct: Application Calls Domain
```typescript
import { evaluateProduct } from '@shared-core/src/domain/product/engine'

const { vendavel } = evaluateProduct(product)
```

---

## 9. Migration from Old Structure

### Old → New Mapping

| Old Location | New Location | Change |
|--------------|--------------|--------|
| `shared-core/src/engine/productEngine.ts` | `shared-core/src/domain/product/engine.ts` | Consolidated with statusPublicacao functions |
| `pdv-importados/core/catalog/statusPublicacao.ts` | Pure re-export from `domain/product/engine` | Functions moved, wrapper kept |
| `pdv-importados/app/aplicacao/types/CadastroData.ts` | `shared-core/src/domain/product/requests/CadastroData.ts` | Moved to shared layer |
| `pdv-importados/app/aplicacao/types/ContextoApp.ts` | `shared-core/src/domain/product/requests/ContextoApp.ts` | Moved to shared layer |
| `pdv-importados/core/systemRules.ts` | Imports from `domain/product/engine` | Updated imports |

### Code Updates Required

1. **Remove old local imports:**
   ```typescript
   // ❌ OLD
   import { CadastroData } from '@/app/aplicacao/types/CadastroData'
   
   // ✓ NEW
   import type { CadastroData } from '@shared-core/src/domain/product/requests/CadastroData'
   ```

2. **Update function imports:**
   ```typescript
   // ❌ OLD
   import { statusInicialProduto } from '@/core/systemRules'
   
   // ✓ NEW
   import { statusInicialProduto } from '@shared-core/src/domain/product/engine'
   ```

3. **Verify no duplication:**
   ```bash
   grep -r "export type StatusPublicacao" src/
   # Should return only ONE file: shared-core/src/domain/product/types.ts
   ```

---

## 10. Timeline of Consolidation

### Phase 1 (✅ DONE)
- Created `shared-core/src/domain/product/` structure
- Consolidated types.ts, requests/, engine.ts
- Zero logic changes, pure reorganization

### Phase 2 (✅ DONE)
- Fixed re-export pattern in `core/ports/produto.ts`
- Updated all imports across modules
- Maintained backward compatibility wrappers

### Phase 3 (✅ DONE)
- Removed duplicate type files from `app/aplicacao/types/`
- Converted legacy `statusPublicacao.ts` to pure wrapper
- Updated all import statements

### Phase 4 (✅ DONE)
- Verified Application layer isolation
- Confirmed no Persistence imports from app/aplicacao
- All dependencies flow in correct direction

---

## 11. Future-Proofing

This architecture ensures:

✓ **Single source of truth** for product domain
✓ **Testability** via isolated layers
✓ **Modularity** with clear boundaries
✓ **Extensibility** without multiplying logic
✓ **Stability** through enforced rules

Avoid adding new types/rules anywhere outside `shared-core/src/domain/product/`. When a new product-related concept emerges, consolidate it here first.
