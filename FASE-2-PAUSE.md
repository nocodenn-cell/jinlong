# FASE 2 - PAUSA CRÍTICA

## Status
🛑 **PAUSADA IMEDIATAMENTE** - Erro de sequência detectado

## O que aconteceu

Removemos re-exports de `engine.ts` ANTES de garantir que não havia consumidores importando deles.

### Violação de Regra
```
statusPublicacao, ProdutoOrigem foram removidos de:
  @shared-core/src/domain/product/engine

Mas ainda estão sendo importados de lá em:
  ✗ pdv-importados/app/gerente/produtos/actions.ts
  ✗ pdv-importados/core/systemRules.ts
  ✗ shared-core/src/catalog/isProdutoVendavel.ts

Resultado: TypeScript error "declared locally, but not exported"
```

## Recuperação

✅ Re-exports restaurados em `engine.ts`
✅ Wrappers restaurados (statusPublicacao.ts, productEngine.ts)
✅ Build estabilizado
⏸️ **Aguardando execução corrigida**

## Nova Regra Obrigatória

```
RESTRIÇÃO CRÍTICA:

Nenhum arquivo ou re-export pode ser REMOVIDO enquanto:
1. Existir qualquer import ativo apontando para ele
2. Existir qualquer consumidor daquele path
```

## Consumidores Reais Mapeados

### Importam de @shared-core/src/domain/product/engine
```
✅ pdv-importados/app/gerente/produtos/ProdutosGerentePageClient.tsx
   → JÁ ATUALIZADO (importa de engine, não types)

⚠️ pdv-importados/app/gerente/produtos/actions.ts
   → AINDA IMPORTA StatusPublicacao/ProdutoOrigem DE ENGINE

⚠️ pdv-importados/core/systemRules.ts
   → AINDA IMPORTA ProdutoOrigem DE ENGINE

⚠️ shared-core/src/catalog/isProdutoVendavel.ts
   → AINDA IMPORTA StatusPublicacao DE ENGINE

✅ pdv-importados/lib/adapters/supabase/produtoRepository.ts
   → JÁ ATUALIZADO (importa de @/core/catalog/statusPublicacao)

Wrappers (esperado importarem de engine):
  pdv-importados/core/catalog/statusPublicacao.ts
  shared-core/src/engine/productEngine.ts
```

## Ordem Correta de Execução (FASE 2B)

### ETAPA A: Atualizar consumidores diretos
Migrar importação de StatusPublicacao/ProdutoOrigem de `engine.ts` para `types.ts` em:

1. **pdv-importados/app/gerente/produtos/actions.ts**
   - Trocar: `from '@shared-core/src/domain/product/engine'`
   - Por: `from '@shared-core/src/domain/product/types'`

2. **pdv-importados/core/systemRules.ts**
   - Trocar: `type ProdutoOrigem from '@shared-core/src/domain/product/engine'`
   - Por: `type ProdutoOrigem from '@shared-core/src/domain/product/types'`

3. **shared-core/src/catalog/isProdutoVendavel.ts**
   - Trocar: `StatusPublicacao from '../domain/product/engine'` (se houver)
   - Por: `StatusPublicacao from '../domain/product/types'`

### ETAPA B: Remover re-exports de engine.ts
Somente depois que NINGUÉM mais importa:
```
export type { StatusPublicacao, ProdutoOrigem }
```

### ETAPA C: Remover wrappers
Remover arquivos apenas quando zero consumidores os usam:
- `pdv-importados/core/catalog/statusPublicacao.ts`
- `shared-core/src/engine/productEngine.ts`

## Validação

Após cada etapa:
```bash
npm run validate:architecture
```

Esperado final:
- ✅ Domain type uniqueness: PASS
- ✅ Import direction: PASS
- ✅ Multi-path symbols: PASS (StatusPublicacao em 2 paths, ProdutoOrigem em 2 paths)

## Commits Anteriores

- `4e07348`: FASE 1 (enforcement infraestrutura)
- `ba3edcb`: ❌ FASE 2 REVERTIDO (erro de sequência)
- Current: Pausa com re-exports restaurados

---

**Próximo passo:** Aguardando execução de FASE 2B na ordem corrigida
