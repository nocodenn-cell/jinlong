# Fix: Corrigir Resolução de Módulo statusRules

## Problema
Vercel build falhava com erro:
```
Module not found: Can't resolve '@shared-core/product/statusRules'
```

## Causa Raiz
O arquivo `statusRules.ts` foi criado em `shared-core/src/product/` mas o import estava usando `@shared-core/product/statusRules` (sem o `/src/`).

O padrão correto da codebase é sempre usar `@shared-core/src/*` para imports, conforme visto em:
- `@shared-core/src/pdv/scan-pipeline`
- `@shared-core/src/observability/runAction`
- `@shared-core/src/result/actionResult`
- `@shared-core/src/caixa/checkoutSnapshot`
- `@shared-core/src/catalog/isProdutoVendavel`

## Investigação Realizada

### 1. Arquivo Existe?
✓ **SIM**: `shared-core/src/product/statusRules.ts`

### 2. Alias Configurado?
✓ **SIM**: `pdv-importados/tsconfig.json`
```json
{
  "paths": {
    "@shared-core/*": ["../shared-core/*"]
  }
}
```

### 3. TypeScript resolve o caminho?
✓ **SIM**: 
- Import: `@shared-core/src/product/statusRules`
- Resolve para: `../shared-core/src/product/statusRules.ts`
- Arquivo em: `/home/user/fastproduct/shared-core/src/product/statusRules.ts` ✓

### 4. Padrão de Imports
✓ **ENCONTRADO**: Todo `@shared-core` usa `/src/` no path

### 5. Imports Quebrados Similares
✓ **NENHUM**: Apenas esse arquivo tinha o problema

## Correção Aplicada

### Arquivo Modificado
`pdv-importados/components/gerente/produtos/ProdutoFormModal.tsx`

### Mudança
```diff
- import { podeSalvarComoRascunho, getTextoSalvarEdicao } from '@shared-core/product/statusRules'
+ import { podeSalvarComoRascunho, getTextoSalvarEdicao } from '@shared-core/src/product/statusRules'
```

## Verificação Pós-Correção

```
✓ Arquivo: /home/user/fastproduct/shared-core/src/product/statusRules.ts
✓ Alias config: @shared-core/* → ../shared-core/*
✓ Import path: @shared-core/src/product/statusRules
✓ Resolves to: ../shared-core/src/product/statusRules.ts
✓ Arquivo EXISTE nesse path
✓ Sem outros imports quebrados
```

## Commits

```
f8aa8a9 - fix: Corrigir caminho do módulo statusRules para @shared-core/src/product
```

Branch: `claude/cicd-workflows-audit-w68hg1` → PUSHED ✓

## Status Esperado

Após rebuild do Vercel:
1. ✓ Module resolution: `@shared-core/src/product/statusRules` OK
2. ✓ Build completa (se proxy Sentry for resolvido)
3. ✓ Preview Deployment: Ready

**Nota**: Se `npm ci` falhar por erro 403 do proxy Sentry, esse é um problema diferente (requer ação do admin). A resolução de módulo desta correção está OK.

## Padrões de Importação Corretos

Use ao criar novos módulos em shared-core:

```typescript
// ✓ CORRETO
import { foo } from '@shared-core/src/product/statusRules'
import { bar } from '@shared-core/src/pdv/invariants'

// ✓ TAMBÉM CORRETO (sem /src/, para navigation/routes)
import { ROUTES } from '@shared-core/navigation/routes'

// ❌ INCORRETO
import { foo } from '@shared-core/product/statusRules'  // falta /src/
```

O padrão é:
- `shared-core/src/*` → importar como `@shared-core/src/*`
- `shared-core/navigation/*` → importar como `@shared-core/navigation/*`
- Sem `/src/` no meio do path
