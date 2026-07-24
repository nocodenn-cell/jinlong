# BL-2 — Plano de Implementação: Promoções
**Data**: 2026-07-24  
**Status**: 📋 **PLANEJAMENTO**  
**Autor**: Claude (claude-haiku-4-5-20251001)  
**Duração Estimada**: 5-7 sprints (com BL-1 homolog + BL-2)

---

## 1. Visão Geral

Este documento detalha a **roadmap de implementação** de BL-2 (Promoções), construído sobre o alicerce de BL-1 (Desconto de Gerente já mergido). O objetivo é oferecer promoções por produto/categoria com precedência clara e auditoria completa.

### Timeline Recomendado

| Fase | Duração | Dependência | Gating |
|------|---------|-------------|--------|
| **Fase 0: Bloqueador** | 1-2 dias | BL-1 homolog ✅ | Migration #273 |
| **Fase 1: Schema** | 3-5 dias | Fase 0 ✅ | RPC atualiza, índices criados |
| **Fase 2: Backend/Serviço** | 1-2 semanas | Fase 1 ✅ | RPC valida promoção, auditoria ok |
| **Fase 3: Frontend Integração** | 1-2 semanas | Fase 2 ✅ | UI gerente criar promo + PDV exibir |
| **Fase 4: E2E + Testes** | 1 semana | Fase 3 ✅ | 15+ testes passam, regressão OK |
| **Fase 5: Staging + Produção** | 3-5 dias | Fase 4 ✅ | Go-Live liberado |

**Caminho crítico**: Fase 0 → Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 (sequencial).

---

## 2. Fase 0: Bloqueador Crítico (1-2 dias)

### 2.1 Tarefa: Migration #273 — Suporte a `tipo_preco='PROMOCAO'`

**Descrição**: Adicionar 'PROMOCAO' ao CHECK constraint em `itens_venda` + colunas de auditoria.

**Arquivo**: `backend/supabase/migrations/273_bl2_promocoes_schema_base.sql`

**Conteúdo**:

```sql
-- Migration 273: BL-2 — Schema base para promoções
-- Data: 2026-07-XX
-- Escopo: Suporte a tipo_preco='PROMOCAO' + auditoria
-- Idempotente com migration 272

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE A: Adicionar 'PROMOCAO' ao CHECK constraint de itens_venda
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  -- Se o constraint ainda tiver o nome genérico, renomear/dropar
  IF EXISTS (SELECT 1 FROM pg_constraint 
             WHERE conname = 'itens_venda_tipo_preco_check') THEN
    ALTER TABLE public.itens_venda 
      DROP CONSTRAINT itens_venda_tipo_preco_check;
  END IF;

  ALTER TABLE public.itens_venda
    ADD CONSTRAINT itens_venda_tipo_preco_check_v2
    CHECK (tipo_preco IN ('VAREJO', 'ATACADO', 'MANUAL', 'PROMOCAO'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE B: Adicionar colunas de auditoria em itens_venda
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'itens_venda' 
      AND column_name = 'regra_aplicada_id'
  ) THEN
    ALTER TABLE public.itens_venda
      ADD COLUMN regra_aplicada_id UUID REFERENCES public.regras_preco(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'itens_venda' 
      AND column_name = 'desconto_regra_percentual'
  ) THEN
    ALTER TABLE public.itens_venda
      ADD COLUMN desconto_regra_percentual NUMERIC(10,4);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE C: Índices para performance em buscas de promoções ativas
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_regras_preco_ativas_produto
  ON public.regras_preco(produto_id)
  WHERE ativo = true AND (data_validade IS NULL OR data_validade > now());

CREATE INDEX IF NOT EXISTS idx_regras_preco_ativas_categoria
  ON public.regras_preco(categoria_id)
  WHERE ativo = true AND (data_validade IS NULL OR data_validade > now());

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE D: RLS (Row-Level Security) — sem mudanças necessárias
-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS de regras_preco já existe e é adequado (GERENTE/DONO CRUD, todos SELECT ativas)

COMMIT;
```

**Validação Pós-Deploy**:
```sql
-- Verificar CHECK constraint adicionado
SELECT constraint_name FROM information_schema.constraint_column_usage
WHERE table_name = 'itens_venda' 
  AND constraint_name LIKE '%tipo_preco%';
-- Esperado: itens_venda_tipo_preco_check_v2

-- Verificar colunas adicionadas
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'itens_venda'
  AND column_name IN ('regra_aplicada_id', 'desconto_regra_percentual');
-- Esperado: 2 rows
```

**Blockers Resolvidos**:
- ✅ Frontend pode agora enviar `tipo_preco='PROMOCAO'` ao RPC
- ✅ RPC aceita e insere em `itens_venda`
- ✅ Auditoria registra `regra_aplicada_id`

---

## 3. Fase 1: Schema e Validação (3-5 dias)

### 3.1 Tarefa: Atualizar RPC `finalizar_venda_transacional_canonica_v4`

**Arquivo**: `backend/supabase/migrations/274_bl2_promocoes_validacao_rpc.sql`

**Mudanças**:

**A. Aceitar novo parâmetro** (opcional):
```plpgsql
ALTER FUNCTION public.finalizar_venda_transacional_canonica_v4(...)
  -- Adicionar parâmetro (se quiser controlar revalidação de promoção)
  ADD PARAMETER p_revalidar_promocoes boolean DEFAULT false
```

**B. Validação de tipo_preco='PROMOCAO'** (linhas ~230 na RPC):

```plpgsql
-- Adicionar após validação de VAREJO/ATACADO/MANUAL
IF v_tipo_preco = 'PROMOCAO' THEN
  -- (Opcional) Revalidar que regra ainda está ativa?
  IF v_item->>'regra_aplicada_id' IS NOT NULL THEN
    DECLARE
      v_regra_ativa boolean;
    BEGIN
      SELECT ativo AND (data_validade IS NULL OR data_validade > now())
      INTO v_regra_ativa
      FROM public.regras_preco
      WHERE id = (v_item->>'regra_aplicada_id')::UUID;
      
      IF NOT v_regra_ativa THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PROMOCAO_EXPIRADA';
      END IF;
    END;
  END IF;

  -- Validar piso: preço não pode ser < preço_custo
  -- (assume produto.preco_custo existe e é auditado)
  SELECT preco_custo INTO v_preco_custo 
  FROM public.produtos WHERE id = v_produto_id;
  
  IF v_preco_unitario < v_preco_custo THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_ABAIXO_CUSTO:%', v_produto_id;
  END IF;
END IF;
```

**C. Inserção em `itens_venda` com auditoria**:

```plpgsql
-- Ao inserir item, incluir regra_aplicada_id e desconto_regra_percentual
INSERT INTO public.itens_venda (
  id, venda_id, produto_id, quantidade,
  preco_unitario_original, preco_unitario, desconto_unitario,
  tipo_preco, regra_aplicada_id, desconto_regra_percentual
) VALUES (
  gen_random_uuid(), p_venda_id, v_produto_id, v_quantidade,
  v_preco_original, v_preco_unitario, v_desconto_unitario,
  v_tipo_preco,
  COALESCE((v_item->>'regra_aplicada_id')::UUID, NULL),
  COALESCE((v_item->>'desconto_regra_percentual')::NUMERIC, NULL)
) ...
```

**Validação Pós-Deploy**:
```sql
-- Testar inserção com tipo_preco='PROMOCAO'
INSERT INTO public.itens_venda (
  venda_id, produto_id, quantidade, tipo_preco,
  preco_unitario_original, preco_unitario, regra_aplicada_id
) VALUES (
  gen_random_uuid(), '...' /* uuid produto */, 1.0, 'PROMOCAO',
  100.00, 80.00, '...' /* uuid regra */
);
-- Esperado: sucesso (sem erro de CHECK)
```

### 3.2 Tarefa: Estrutura de Dados de Promoção

**Arquivo**: `pdv-importados/app/caixa/tipos/promocao.types.ts` (novo)

```typescript
export interface RegraPromocao {
  id: string
  tipo_regra: 'PRODUTO' | 'CATEGORIA'
  produto_id?: string
  categoria_id?: string
  quantidade_minima: number
  quantidade_maxima?: number
  tipo_desconto: 'PERCENTUAL' | 'VALOR_FIXO'
  valor_desconto: number
  data_validade?: string
  ativo: boolean
  created_by: string
  created_at: string
}

export interface ItemCarrinhoComPromo {
  itemId: string
  produtoId: string
  precoOriginal: number
  precoComPromo: number
  descontoPromoPercentual: number
  regra_aplicada_id: string
}
```

---

## 4. Fase 2: Backend/Serviço (1-2 semanas)

### 4.1 Tarefa: RPC `buscar_promocoes_ativas`

**Arquivo**: `backend/supabase/migrations/275_bl2_rpc_buscar_promocoes.sql`

```sql
CREATE OR REPLACE FUNCTION public.buscar_promocoes_ativas(
  p_produto_id UUID,
  p_categoria_id UUID DEFAULT NULL,
  p_quantidade_compra NUMERIC DEFAULT 1,
  p_data_referencia TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(
  regra_id UUID, tipo_desconto text, valor_desconto NUMERIC(10,4),
  quantidade_minima NUMERIC(10,3), quantidade_maxima NUMERIC(10,3)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    rp.id, rp.tipo_desconto, rp.valor_desconto,
    rp.quantidade_minima, rp.quantidade_maxima
  FROM public.regras_preco rp
  WHERE rp.ativo = true
    AND (rp.data_validade IS NULL OR rp.data_validade > p_data_referencia)
    AND (
      (rp.tipo_regra = 'PRODUTO' AND rp.produto_id = p_produto_id)
      OR
      (rp.tipo_regra = 'CATEGORIA' AND rp.categoria_id = p_categoria_id)
    )
    AND p_quantidade_compra >= rp.quantidade_minima
    AND (rp.quantidade_maxima IS NULL OR p_quantidade_compra <= rp.quantidade_maxima)
  ORDER BY rp.quantidade_minima DESC
  LIMIT 1;  -- Retorna a regra mais específica (maior quantidade_minima)
END;
$function$;
```

### 4.2 Tarefa: Serviço TypeScript `promocaoService.ts`

**Arquivo**: `shared-core/src/pricing/promocaoService.ts` (novo)

```typescript
import { RegraPromocao } from '...'

export class PromocaoService {
  /**
   * Buscar promoção ativa para um item (produto/categoria + quantidade).
   * Precedência: Produto > Categoria.
   */
  async buscarPromocaoAtiva(
    input: {
      produtoId: string
      categoriaId?: string
      quantidade: number
      categoriaDoProduct: string
    }
  ): Promise<RegraPromocao | null> {
    // Implementar busca que:
    // 1. Query RPC buscar_promocoes_ativas
    // 2. Validar temporal (data_validade)
    // 3. Validar quantidade (min/max)
    // 4. Retornar regra com maior especificidade
  }

  /**
   * Calcular preço com promoção aplicada.
   */
  aplicarPromocao(
    precoOriginal: number,
    regra: RegraPromocao
  ): { precoComPromo: number; descontoPercentual: number } {
    if (regra.tipo_desconto === 'PERCENTUAL') {
      const desconto = (precoOriginal * regra.valor_desconto) / 100
      return {
        precoComPromo: Math.max(0, precoOriginal - desconto),
        descontoPercentual: regra.valor_desconto
      }
    } else {
      // VALOR_FIXO
      return {
        precoComPromo: Math.max(0, precoOriginal - regra.valor_desconto),
        descontoPercentual: (regra.valor_desconto / precoOriginal) * 100
      }
    }
  }
}
```

### 4.3 Tarefa: Integração no `unifiedCartStore`

**Arquivo**: `shared-core/src/stores/unifiedCartStore.ts` (modificação)

**Mudanças**:

```typescript
export interface ItemCarrinho {
  id: string
  produtoId: string
  quantidade: number
  precoVariejo?: number
  precoUnitario?: number
  precoOriginal?: number
  
  // NOVO: Auditoria de promoção
  promoAplicada?: {
    regra_id: string
    tipo_desconto: 'PERCENTUAL' | 'VALOR_FIXO'
    valor_desconto: number
    descontoPercentualFinal: number  // calculado
  }
}

export interface CarrinhoState {
  itens: ItemCarrinho[]
  // NOVO: Rastrear promoções por item
  promoesAplicadas: Map<string, { regra_id: string; desconto: number }>
  
  // NOVO: Método para aplicar promoção a um item
  aplicarPromocaoItem(itemId: string, regra: RegraPromocao): void
  
  // Modificar: recalcularTotais() para incluir desconto de promo
  recalcularTotais(): void
}

// Implementação:
aplicarPromocaoItem(itemId: string, regra: RegraPromocao) {
  const item = this.itens.find(i => i.id === itemId)
  if (!item) return

  const precoBase = item.precoVariejo || item.precoOriginal || 0
  const desconto = regra.tipo_desconto === 'PERCENTUAL'
    ? (precoBase * regra.valor_desconto) / 100
    : regra.valor_desconto

  item.promoAplicada = {
    regra_id: regra.id,
    tipo_desconto: regra.tipo_desconto,
    valor_desconto: regra.valor_desconto,
    descontoPercentualFinal: (desconto / precoBase) * 100
  }
  item.precoUnitario = Math.max(0, precoBase - desconto)

  this.recalcularTotais()
}
```

---

## 5. Fase 3: Frontend (1-2 semanas)

### 5.1 Tarefa: UI Operador — Exibir Promoções

**Arquivo**: `pdv-importados/app/caixa/components/CartItemPromo.tsx` (novo)

```typescript
export function CartItemPromo({ item, promocao }: Props) {
  return (
    <div className="flex justify-between items-center text-sm text-green-600">
      <span>🎉 Promoção: {promocao.tipo_desconto === 'PERCENTUAL' ? `${promocao.valor}%` : `R$${promocao.valor}`}</span>
      <span>-R${item.precoOriginal - item.precoUnitario}</span>
    </div>
  )
}
```

### 5.2 Tarefa: Admin UI — Gerenciar Promoções

**Arquivo**: `pdv-importados/app/admin/components/PromocaoForm.tsx` (novo)

```typescript
export function PromocaoForm({ onSubmit }: Props) {
  const [form, setForm] = useState({
    tipo_regra: 'PRODUTO' as const,
    produto_id: '',
    categoria_id: '',
    quantidade_minima: 0,
    quantidade_maxima: null,
    tipo_desconto: 'PERCENTUAL' as const,
    valor_desconto: 0,
    data_validade: null,
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form) }}>
      <select value={form.tipo_regra} onChange={(e) => setForm({ ...form, tipo_regra: e.target.value as any })}>
        <option value="PRODUTO">Produto</option>
        <option value="CATEGORIA">Categoria</option>
      </select>

      {form.tipo_regra === 'PRODUTO' && (
        <ProductSelect value={form.produto_id} onChange={(id) => setForm({ ...form, produto_id: id })} />
      )}

      {form.tipo_regra === 'CATEGORIA' && (
        <CategorySelect value={form.categoria_id} onChange={(id) => setForm({ ...form, categoria_id: id })} />
      )}

      <input type="number" placeholder="Qty min" value={form.quantidade_minima} min="0" />
      <input type="number" placeholder="Qty max" value={form.quantidade_maxima || ''} min="0" nullable />

      <select value={form.tipo_desconto} onChange={(e) => setForm({ ...form, tipo_desconto: e.target.value as any })}>
        <option value="PERCENTUAL">% Desconto</option>
        <option value="VALOR_FIXO">Valor Fixo</option>
      </select>

      <input type="number" placeholder="Valor" value={form.valor_desconto} min="0" />

      <input type="datetime-local" value={form.data_validade || ''} onChange={(e) => setForm({ ...form, data_validade: e.target.value || null })} />

      <button type="submit">Criar Promoção</button>
    </form>
  )
}
```

### 5.3 Tarefa: Integração no PDV — Fluxo de Carrinho

**Arquivo**: `pdv-importados/app/caixa/server/caixaVendas.impl.ts` (modificação)

```typescript
// Após validação de item (linhas ~188):

// NOVO: Buscar e aplicar promoção
const promocao = await buscarPromocaoAtivaRpc(supabase, {
  produtoId: item.produtoId,
  quantidade: item.quantidade,
  lojaId
})

if (promocao) {
  // Aplicar desconto ao item
  const desconto = promocao.tipo_desconto === 'PERCENTUAL'
    ? (item.precoUnitario * promocao.valor_desconto) / 100
    : promocao.valor_desconto
  
  item.precoUnitario = Math.max(item.precoUnitario - desconto, 0)
  item.regra_aplicada_id = promocao.id
  item.desconto_regra_percentual = (desconto / item.precoOriginal) * 100
}
```

---

## 6. Fase 4: E2E + Testes (1 semana)

### 6.1 Testes Requeridos

| # | Cenário | Arquivo E2E | Status |
|---|---------|------------|--------|
| 1 | Promoção simples (% desconto) | `caixa-promo-percentual.spec.ts` | ⬜ |
| 2 | Promoção valor fixo | `caixa-promo-fixo.spec.ts` | ⬜ |
| 3 | Promoção com quantidade mínima | `caixa-promo-quantidade.spec.ts` | ⬜ |
| 4 | Promoção com data de validade | `caixa-promo-validade.spec.ts` | ⬜ |
| 5 | Múltiplas promoções (melhor vence) | `caixa-promo-precedencia.spec.ts` | ⬜ |
| 6 | Promo + desconto manual | `caixa-promo-desconto-manual.spec.ts` | ⬜ |
| 7 | Promo + desconto gerente | `caixa-promo-desconto-gerente.spec.ts` | ⬜ |
| 8 | Promo não ativa (ausente) | `caixa-promo-ausente.spec.ts` | ⬜ |
| 9 | Auditoria: regra_aplicada_id | `caixa-promo-auditoria.spec.ts` | ⬜ |
| 10 | Regressão: carrinho sem promo | `caixa-venda-regressao-promo.spec.ts` | ⬜ |

### 6.2 Exemplo: Teste #1 — Promoção Percentual

**Arquivo**: `pdv-importados/e2e/caixa-promo-percentual.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test('Promoção percentual deve descontar corretamente', async ({ page }) => {
  // 1. Setup: Criar produto com promoção ativa
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const produtoId = '...'  // UUID seed
  
  await supabase.from('regras_preco').insert({
    tipo_regra: 'PRODUTO',
    produto_id: produtoId,
    quantidade_minima: 1,
    tipo_desconto: 'PERCENTUAL',
    valor_desconto: 20,  // -20%
    ativo: true
  })

  // 2. Login operador
  await page.goto('/caixa/login')
  await page.fill('input[name="email"]', process.env.PLAYWRIGHT_CAIXA_TEST_EMAIL)
  await page.fill('input[name="password"]', process.env.PLAYWRIGHT_CAIXA_TEST_PASSWORD)
  await page.click('button[type="submit"]')

  // 3. Iniciar venda
  await page.goto('/caixa')
  await page.click('[data-testid="novo-venda"]')

  // 4. Adicionar produto com promoção
  await page.fill('[data-testid="barcode-input"]', '7898512340003')
  await page.press('[data-testid="barcode-input"]', 'Enter')
  
  // 5. Validar que preço foi reduzido em 20%
  const precoOriginal = 100  // Variável de teste
  const precoComPromo = 80
  
  const itemElement = page.locator('[data-testid="cart-item"]').last()
  await expect(itemElement).toContainText(`R$${precoComPromo}`)

  // 6. Finalizar venda
  await page.click('[data-testid="finalizar-venda"]')
  
  // 7. Validar SQL: regra_aplicada_id preenchido
  const { data } = await supabase
    .from('itens_venda')
    .select('regra_aplicada_id, desconto_regra_percentual')
    .order('created_at', { ascending: false })
    .limit(1)
  
  expect(data[0].regra_aplicada_id).toBeTruthy()
  expect(data[0].desconto_regra_percentual).toBe(20)
})
```

---

## 7. Fase 5: Staging + Produção (3-5 dias)

### 7.1 Checklist de Deploy

- [ ] Todas as migrations aplicadas ao staging (273, 274, 275)
- [ ] RPC atualizado e testado
- [ ] E2E crítico (10+ testes) passou
- [ ] Regressão validada (vendas sem promo funcionam)
- [ ] Admin UI para criar/editar promoções testado
- [ ] PDV exibe promoção corretamente
- [ ] Auditoria em `itens_venda.regra_aplicada_id` funciona
- [ ] Desconto total (promo + manual + gerente) respeita limite (60%)
- [ ] Aprovação de negócio obtida
- [ ] Runbook de rollback pronto

### 7.2 Runbook de Rollback

**Se necessário reverter BL-2**:

```sql
-- 1. Desabilitar promoções
UPDATE public.regras_preco SET ativo = false;

-- 2. Opcional: Reverter colunas (dados preservados)
ALTER TABLE public.itens_venda DROP COLUMN IF EXISTS regra_aplicada_id;
ALTER TABLE public.itens_venda DROP COLUMN IF EXISTS desconto_regra_percentual;

-- 3. Reverter CHECK constraint (aceitar apenas 3 tipos)
ALTER TABLE public.itens_venda DROP CONSTRAINT itens_venda_tipo_preco_check_v2;
ALTER TABLE public.itens_venda ADD CONSTRAINT itens_venda_tipo_preco_check
  CHECK (tipo_preco IN ('VAREJO', 'ATACADO', 'MANUAL'));

-- 4. App: git revert <commit_bl2>
```

**Tempo estimado**: 30 minutos (com prévia sincronização).

---

## 8. Entrega por Sprint (Alocação Recomendada)

| Sprint | Trabalho | Owner | Esforço |
|--------|----------|-------|--------|
| **S1** (Bloqueador) | Migration 273 + testes schema | Backend | 2-3 dias |
| **S2** (Schema) | Migration 274-275 + RPC atualizado | Backend | 1 semana |
| **S3** (Serviço) | PromocaoService + unifiedCartStore | FullStack | 1 semana |
| **S4** (Frontend) | Admin UI + PDV integração | Frontend | 1 semana |
| **S4-S5** (Paralelo) | E2E + testes unitários | QA + Dev | 1 semana |
| **S5** (Staging) | Deploy staging + smoke test | DevOps | 3-5 dias |
| **S5** (Produção) | Deploy + monitoring | DevOps | 1-2 dias |

**Caminho Crítico**: S1 → S2 → S3 → S4/S5 (paralelo) → S5 (sequencial).

---

## 9. Dependências Externas

| Dependência | Impacto | Status | Ação |
|-------------|--------|--------|------|
| **BL-1 Homologação** | Bloqueador | ⏳ Em execução | Aguardar conclusão |
| **Ambiente Staging** | Necessário para E2E | ✅ Disponível | Usar como-é |
| **Seed de Dados** | Testes reproduzíveis | ✅ Disponível | Estender com promoções |
| **Aprovação Negócio** | Gating antes Go-Live | ⏳ Pendente | Obter na Fase 4 |

---

## 10. Monitoramento e Métricas (Pós-Go-Live)

### 10.1 Métricas de Negócio

- Quantas vendas tiveram promoção aplicada (% do total)
- Desconto médio por promoção (R$)
- Taxa de conversão: visitantes → compra (com vs sem promo)
- Margem média impactada por promoção

### 10.2 Métricas Técnicas

- Taxa de erro ao aplicar promoção (% de falhas)
- Latência de busca de promoção (p95)
- Concorrência: quantas regras ativas simultâneas
- Auditoria: 100% de `regra_aplicada_id` preenchido?

### 10.3 Alertas Críticos

- ❌ Taxa de erro de promoção > 1% → PagerDuty
- ❌ Latência RPC buscar_promocoes > 500ms → Log
- ❌ Promoção expirada ainda ativa → Manual review

---

## 11. Conclusão

Este plano estrutura a implementação de BL-2 em 5 fases sequenciais, começando com o bloqueador crítico (schema) e terminando com Go-Live produção. A integração com BL-1 é suave: descontos se acumulam de forma previsível.

**Próxima ação**: Aprovação deste plano → Iniciar Fase 0 (bloqueador).

---

**Data**: 2026-07-24  
**Status**: 📋 Planejamento Completo  
**Próximo**: BL2_MATRIZ_RISCOS.md + Aprovação Negócio
