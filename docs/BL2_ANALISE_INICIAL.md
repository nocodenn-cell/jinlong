# BL-2 — Análise Inicial: Promoções e Regras de Preço
**Data**: 2026-07-24  
**Status**: 🔍 **ANÁLISE EM ANDAMENTO**  
**Autor**: Claude (claude-haiku-4-5-20251001)  
**Escopo**: Auditoria técnica + impactos de implementação de promoções

---

## Executive Summary

BL-2 visa implementar um **sistema de promoções por produto/categoria** com precedência clara no motor de preços. A infraestrutura parcial já existe (`regras_preco` tabela + `PricingService` TypeScript), mas há **bloqueador crítico**: tipo de preço `PROMOCAO` é declarado em TypeScript mas **rejeitado pelo banco** (CHECK constraint em `itens_venda.tipo_preco`).

| Aspecto | Status | Ação Requerida |
|---------|--------|---|
| **Infraestrutura de regras** | ✅ 70% | Completar migration + RPC |
| **Motor de preço** | ✅ SSOT garantido | Validar precedência ATACADO vs PROMOCAO |
| **Suporte DB (PROMOCAO)** | ❌ BLOQUEADOR | Adicionar 'PROMOCAO' ao CHECK constraint |
| **Auditoria** | ✅ 80% | Adicionar `regra_aplicada_id` em itens_venda |
| **Carrinho (frontend)** | ✅ Suportado | `unifiedCartStore` já maneja PROMOCAO |
| **Finalização** | ✅ Pronto | `finalizar_venda_canonica_v4` revalida tipos |

---

## 1. Auditoria do Estado Atual

### 1.1 Tabela `regras_preco` — Declaração Parcial

**Localização**: `backend/supabase/migrations/001_schema_inicial.sql` (linhas 140-178)

**Status**: ✅ Schema criado, ❌ Não integrado ao motor de preço

```sql
-- Colunas principais:
CREATE TABLE public.regras_preco (
  id UUID PRIMARY KEY,
  tipo_regra TEXT CHECK (tipo_regra IN ('PRODUTO', 'CATEGORIA')),
  produto_id UUID REFERENCES public.produtos(id),
  categoria_id UUID REFERENCES public.categorias(id),
  quantidade_minima NUMERIC(10,3) NOT NULL,
  quantidade_maxima NUMERIC(10,3),
  tipo_desconto TEXT CHECK (tipo_desconto IN ('PERCENTUAL', 'VALOR_FIXO')),
  valor_desconto NUMERIC(10,4) NOT NULL,
  data_validade TIMESTAMPTZ,
  ativo BOOLEAN DEFAULT true
);
```

**Restrições de integridade**:
- ✅ Exatamente um de `produto_id` ou `categoria_id` deve estar preenchido
- ✅ `data_validade` pode ser NULL (sem expiração)
- ✅ RLS: apenas GERENTE/DONO podem ler/escrever

**Índices existentes**:
- `idx_regras_produto` — busca rápida por produto
- `idx_regras_categoria` — busca rápida por categoria

**Gap crítico**: Nenhuma RPC integra `regras_preco` ao cálculo de preço. Tabela é **apenas estrutura**, não há lógica de aplicação.

### 1.2 Motor de Preço — SSOT (Single Source of Truth) Atual

**Cadeia de Decisão** (RPC `calcular_preco_produto`, migration 250):

```
1. Tiers em precos_atacado (por quantidade mínima)
2. Catálogo + quantidade mínima padrão (config)
3. Fallback varejo
```

**Precedência explícita:**
```plpgsql
-- PASSO 1: Tier vence sempre (se existe)
-- PASSO 2: Catálogo vence se quantidade ≥ minPadrao
-- PASSO 3: Varejo é fallback (sempre aplica)
```

**Equivalente TypeScript**: `calcularPrecoCanonico()` em `shared-core/src/pricing/`

**CHAIN de Resolução** (resolution.ts, linhas 54-58):
```typescript
export const PRICE_RESOLUTION_CHAIN: readonly PriceSourceKind[] = [
  'tier',      // Prioridade 1 (maior)
  'catalogo',  // Prioridade 2
  'varejo',    // Prioridade 3 (menor)
]
```

**⚠️ Achado Crítico**: Promoções **não estão na cadeia**. PROMOCAO não vence nada — é tratado como desconto manual por item, não como tipo de preço automático.

### 1.3 Tipos de Preço Suportados

| Tipo | Frontend | Backend (RPC) | DB (`itens_venda.tipo_preco`) | Suporte |
|------|----------|---------------|-------------------------------|---------|
| **VAREJO** | ✅ | ✅ `calcular_preco_produto` | ✅ CHECK permite | ✅ 100% |
| **ATACADO** | ✅ | ✅ `calcular_preco_produto` tier | ✅ CHECK permite | ✅ 100% |
| **MANUAL** | ✅ Desconto por item | ✅ Bypass de validação | ✅ CHECK permite | ✅ 100% |
| **PROMOCAO** | ✅ `PricingService.ts` | ✅ Tipo declarado | ❌ CHECK **rejeita** | ❌ 0% |

**Bloqueador**: Migration 001_schema_inicial.sql linha 208:
```sql
tipo_preco TEXT NOT NULL CHECK (tipo_preco IN ('VAREJO', 'ATACADO', 'MANUAL'))
-- FALTA: 'PROMOCAO'
```

### 1.4 Infraestrutura TypeScript de Promoções

**Arquivo**: `shared/pricing/PricingService.ts`

**Método principal**: `calcularPrecoItem()` (linhas 35-71)

```typescript
if (promocao) {
  if (promocao.precoFixo != null) {
    precoUnitario = promocao.precoFixo
  } else if (promocao.descontoPercentual) {
    precoUnitario = precoOriginal - (precoOriginal * promocao.descontoPercentual) / 100
  }
  return {
    tipoPreco: 'PROMOCAO'  // ← Linha 69
  }
}
```

**Busca de regra** (linhas 73-84): `encontrarPromocao()` + validação temporal + quantidade.

**Status**: ✅ Lógica completa, mas desconectada do motor canônico.

### 1.5 Desconto de Gerente (BL-1) vs Promoção (BL-2)

**Desconto de Gerente** (BL-1):
- Tabela: `tokens_desconto_gerente` (auditado, uso único)
- Aplicação: **Global sobre total** (após descontos por item)
- RLS: Apenas gerente pode gerar/revogar
- Persiste em: `descontos_venda` (com motivo + operador_id + timestamp)

**Promoção** (BL-2 — proposto):
- Tabela: `regras_preco` (sem usar ainda)
- Aplicação: **Por item** durante carrinho
- RLS: Gerente/Admin controlam, operador vê ativa
- Persiste em: `itens_venda` (tipo_preco='PROMOCAO', regra_aplicada_id)

**Questão Crítica**: Pode haver **ambos na mesma venda**?
- Exemplo: Produto com promoção -20% + desconto de gerente -10% global
- Esperado: Preço = (preco_base - 20%) - 10% = preco_base * 0.72
- Rigor: Descontos se acumulam? Há limite total?

---

## 2. Regras de Negócio Existentes

### 2.1 Desconto Manual por Item (BL-1)

**Limite**: `pdv_config.max_desconto_manual_item_percentual` (default 15%)

**Validação**: Trigger `trg_itens_venda_limite_desconto_bi/bu` (migration 122)

```plpgsql
-- Não aplica limite a ATACADO
IF NEW.tipo_preco = 'ATACADO' THEN
  RETURN NEW;
END IF;

-- Bypass com token gerente válido
IF current_setting('session.gerente_token_validado', true) = 'true' THEN
  RETURN NEW;
END IF;

-- Validar limite (preço não pode cair abaixo de preço_mínimo)
```

### 2.2 Desconto de Gerente Global (BL-1)

**Limite**: `pdv_config.max_desconto_gerente_percentual` (default 20-30%)

**Validação**:
1. Token válido e não-expirado em `tokens_desconto_gerente`
2. Token marcado como `usado=false`
3. Percentual ≤ limit configurável

**Após BL-1**: Registrado em `descontos_venda` com motivo + operador_id + timestamp

### 2.3 Quantidade Mínima para Atacado

**Origem**: `pdv_config.quantidade_minima_atacado_padrao` (default 6)

**Aplicação**: Em `calcular_preco_produto`, se quantidade ≥ min → usa `preco_atacado` do catálogo

### 2.4 Tiers de Quantidade

**Tabela**: `precos_atacado` (migration 006)

```sql
CREATE TABLE public.precos_atacado (
  id UUID PRIMARY KEY,
  produto_id UUID REFERENCES public.produtos(id),
  loja_id UUID NULL,  -- NULL = aplica globalmente
  quantidade_minima NUMERIC(10,3) NOT NULL,
  preco_unitario NUMERIC(10,2) NOT NULL,
  ativo BOOLEAN DEFAULT true
);
```

**Precedência**: Tier específico (maior quantidade_minima) vence tiers genéricos.

---

## 3. Impacto no Motor de Preço (SSOT)

### 3.1 Problema: Onde Promoções se Encaixam?

**Cenário 1 — Promoção com Precedência Alta (antes de ATACADO)**:
```
Produto: Camiseta, preco_varejo: R$50, preco_atacado: R$40
Promoção: -20% em camisetas (válida agora, qnt mín: 0)
Compra: 3 unidades

Resultado esperado:
  - Sem promoção: 3 × R$40 (atacado) = R$120
  - Com promoção: 3 × (R$50 - 20%) = 3 × R$40 = R$120
  ❓ Qual referência? Varejo ou atacado?
```

**Cenário 2 — Promoção com Precedência Baixa (após ATACADO)**:
```
Produção: Jogo de Copos, preco_varejo: R$80, preco_atacado: R$60
Promoção: -15% (válida, qnt mín: 2)
Compra: 2 unidades

Resultado esperado:
  - Sem promoção: 2 × R$60 (atacado, qnt≥6) = NÃO, qnt=2 < 6 → varejo → 2 × R$80 = R$160
  - Com promoção: 2 × (R$80 - 15%) = 2 × R$68 = R$136
  ❓ Ou: 2 × R$60 (atacado na base, depois promo)? = 2 × (R$60 - 15%) = R$102
```

### 3.2 Decisão de Design Recomendada

**Opção A — Promoção é desconto manual por item (recomendado)**:
- ✅ Simples, não duplica SSOT
- ✅ Validação já existe (trigger de limite 15%)
- ✅ Integra bem com tipo_preco='MANUAL'
- ❌ Perde precedência implícita
- ❌ Não é "preço automático"

**Opção B — Promoção vence VAREJO, perde para ATACADO**:
```
Precedência: Tier > Atacado Catálogo > PROMOCAO > Varejo
```
- ✅ Promoção não quebra tiers
- ⚠️ Complexo: adiciona fonte à PRICE_RESOLUTION_CHAIN
- ❌ Questão: E se promo é -50%? Pode ser < custo?

**Opção C — Promoção vence tudo (except tiers de quantidade)**:
```
Precedência: Tier > PROMOCAO > Atacado Catálogo > Varejo
```
- ✅ Promoção é prioritária (marketing quer isto)
- ⚠️ Pode esvaziar margem
- ⚠️ Requer validação de piso (preço_custo)

**Recomendação**: **Opção A** → Promoção = desconto manual, integrado ao trigger existente.
Motivo: SSOT intacto, sem duplicação de lógica, reutiliza validação.

### 3.3 Preservação do SSOT (Single Source of Truth)

**Regra obrigatória**: Cálculo de preço **acontece apenas no RPC** `calcular_preco_produto`.

**Frontend**: 
- ✅ Exibe preço (pré-calculado, do carrinho)
- ❌ **Nunca recalcula** preço automáticamente
- ❌ **Nunca aplica regra** de desconto

**Backend (RPC)**:
- ✅ Recalcula e revalida **antes de finalizar**
- ✅ Rejeita inconsistências

**Validação em finalizar_venda_canonica_v4** (migration 272, linhas 216-228):
```plpgsql
-- Se tipo = VAREJO/ATACADO, revalidar contra RPC
v_calc := public.calcular_preco_produto(...);
v_preco_esperado := (v_calc>>'preco')::numeric;
IF ABS(v_preco_esperado - v_preco_unitario) > v_eps THEN
  RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_DIVERGENTE:%', v_produto_id;
```

---

## 4. Impacto no PDV e Carrinho

### 4.1 UnifiedCartStore (Zustand)

**Arquivo**: `shared-core/src/stores/unifiedCartStore.ts`

**Interface ItemCarrinho** (linhas 10-24):
```typescript
export interface ItemCarrinho {
  id: string
  produtoId: string
  quantidade: number
  resultado?: {
    precoUnitario: number
    precoOriginal: number
    descontoUnitario: number
    tipoPreco: 'VAREJO' | 'ATACADO' | 'MANUAL' | 'PROMOCAO'  // ← suporta
  }
}
```

**Métodos impactados por BL-2**:
- `adicionarItem()` — ao adicionar, fetch regras_preco ativas?
- `atualizarQuantidade()` — recalcular preço se promo tem qnt mín?
- `sincronizarPrecoCalculadoRpc()` — revalidar contra servidor

**Status**: ✅ Estrutura suporta PROMOCAO, ❌ lógica de aplicação não implementada.

**Ação necessária**:
```typescript
// Adicionar hook ao adicionar/atualizar item:
if (item.resultado?.tipoPreco === 'PROMOCAO') {
  // Aplicar lógica de promo (desconto % ou fixo)
  // Validar piso (não abaixo de custo)
}
```

### 4.2 Fluxo de Carrinho → Finalização

**Sequência**:
1. Operador escaneia produto
2. `unifiedCartStore.adicionarItem()` com preço_varejo default
3. Se qnt ≥ min_atacado → `sincronizarPrecoCalculadoRpc()` atualiza
4. Se promoção ativa → aplicar desconto (TBD como)
5. Exibir total (bruto + desconto aplicado)
6. Operador toca "Finalizar"
7. Frontend envia carrinho ao backend
8. RPC `finalizar_venda_canonica_v4` **revalidar preço** (linhas 216-228)
9. Se divergência > epsilon → rejeita com erro

**Impacto de BL-2**:
- Passo 4: Adicionar lógica de busca/aplicação de promo
- Passo 8: RPC valida tipo_preco='PROMOCAO' (requer schema change)

### 4.3 Preservação de `unifiedCartStore`

**Obrigação**: Não retirar, não duplicar estado.

**Proposta**:
- ✅ Manter como é, adicionar `promoAplicadas: RegraPreco[]`
- ✅ Calcular desconto total de promo em `recalcularTotais()`
- ❌ Não adicionar lógica de RPC aqui

---

## 5. Conflitos entre BL-1 (Desconto Gerente) e BL-2 (Promoção)

### 5.1 Cenário: Mesma Venda com Ambos

```
Produto: Notebook, preço_varejo: R$1000
Promoção: Black Friday -30% (válida até 2026-07-31)
Desconto Gerente: Token com -10% autorizado

Compra: 1 unidade

Resultado esperado:
  Opção 1 (sequencial): (R$1000 - 30%) - 10% = R$630
  Opção 2 (promo + desconto): (R$1000 - 30%) - 10% do original = R$900 - R$100 = R$800
  Opção 3 (máximo de um): máximo de 30% ou 10%? = R$700
```

### 5.2 Regra Proposta (Recomendado)

**Descontos se acumulam**, na ordem:
1. **Promoção** (aplicada por item, durante cálculo de preço)
2. **Desconto manual** (por item, operador autorizado)
3. **Desconto de gerente** (global, sobre total após descontos)

**Limite total**: Desconto total (1+2+3) não pode exceder 60% por padrão (configurável).

**Auditoria**:
- Promoção: registrada em `itens_venda.regra_aplicada_id`
- Desconto manual: em `itens_venda.tipo_preco='MANUAL'`
- Desconto gerente: em `descontos_venda` (com motivo, já BL-1)

### 5.3 Impacto em Auditoria

**Tabela `descontos_venda` (BL-1)**:
- ✅ Já audita desconto global do gerente
- ✅ Já tem operador_id + timestamp + motivo
- ❌ Não audita promoções (elas vão para `itens_venda`)

**Tabela `itens_venda`**:
- Adição proposta: `regra_aplicada_id UUID` (FK → regras_preco.id)
- Adição proposta: Adicionar coluna `desconto_regra_percentual` (snapshot)

---

## 6. Arquitetura Proposta para BL-2

### 6.1 Fluxo Conceptual

```
┌─────────────────────────────────────────────────────────────┐
│ OPERADOR ADICIONA ITEM AO CARRINHO                          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ calcularPrecoCanonico  │ (SSOT — RPC ou TypeScript)
    │ Retorna: VAREJO/ATACADO│
    └────────┬───────────────┘
             │
             ▼
    ┌────────────────────────┐
    │ Buscar regras_preco    │ (promoções ativas)
    │ ativas para o produto  │
    └────────┬───────────────┘
             │
             ▼
    ┌────────────────────────┐
    │ PricingService         │ (se promo + validações)
    │ .calcularPrecoItem()   │
    │ Retorna: VAREJO/ATACADO│
    │   ou    PROMOCAO       │
    └────────┬───────────────┘
             │
             ▼
    ┌────────────────────────┐
    │ unifiedCartStore       │ (armazena item final)
    │ .adicionarItem()       │ tipoPreco + regra_id
    └────────┬───────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ FINALIZAR VENDA                              │
├──────────────────────────────────────────────┤
│ 1. Frontend envia itens ao RPC               │
│ 2. RPC revalida cada item                    │
│    - Se VAREJO/ATACADO: recalc vs RPC        │
│    - Se PROMOCAO: revalidar regra ativa?     │
│ 3. RPC valida limite total (desconto < 60%) │
│ 4. RPC insere em itens_venda com regra_id   │
└──────────────────────────────────────────────┘
```

### 6.2 Entidades Envolvidas

| Entidade | Tabela | Operação | Status |
|----------|--------|----------|--------|
| **Regra de Preço** | `regras_preco` | SELECT ativas + temporal check | ✅ Tabela existe |
| **Promoção por Item** | `itens_venda.tipo_preco='PROMOCAO'` + `regra_aplicada_id` | INSERT/UPDATE | ❌ Falta coluna |
| **Desconto Gerente Global** | `descontos_venda` (BL-1) | INSERT (auditoria) | ✅ Já existe |
| **Limite de Desconto** | `pdv_config.*` | SELECT config | ✅ Já existe |

---

## 7. Impacto em RPCs

### 7.1 RPC `calcular_preco_produto` (migration 250)

**Situação Atual**: Retorna preço VAREJO/ATACADO/MANUAL.

**Impacto de BL-2**: Nenhum direto (promoção é pós-cálculo).

**Possível melhoria** (futuro, não requerida para BL-2):
- Adicionar parâmetro `p_aplicar_promocoes bool` (default false)
- Se true, buscar `regras_preco` ativas e aplicar
- ⚠️ Complexidade: seria duplicação de lógica (já está em `PricingService`)

**Recomendação**: **Manter RPC como está**. Promoção fica no layer TypeScript.

### 7.2 RPC `finalizar_venda_transacional_canonica_v4` (migration 272)

**Situação Atual**: Aceita itens com tipo_preco IN ('VAREJO', 'ATACADO', 'MANUAL').

**Mudança Requerida para BL-2**:

```sql
-- Atualizar CHECK constraint (linhas 208)
CHECK (tipo_preco IN ('VAREJO', 'ATACADO', 'MANUAL', 'PROMOCAO'))
```

**Validação adicional**:
```plpgsql
-- Após linha 228 (validação de preço)
IF NEW.tipo_preco = 'PROMOCAO' THEN
  -- Revalidar que regra ainda está ativa?
  -- Revalidar piso de preço (não abaixo de custo)?
  -- Opcional: registrar regra_aplicada_id em itens_venda
END IF;
```

---

## 8. Migrations Necessárias

### 8.1 Bloqueador Crítico #1: Schema de Tipo de Preço

**Migration nova**: Adicionar 'PROMOCAO' ao CHECK constraint

```sql
-- Na migration 273 (após 272)
ALTER TABLE public.itens_venda
  DROP CONSTRAINT itens_venda_tipo_preco_check;

ALTER TABLE public.itens_venda
  ADD CONSTRAINT itens_venda_tipo_preco_check 
  CHECK (tipo_preco IN ('VAREJO', 'ATACADO', 'MANUAL', 'PROMOCAO'));
```

### 8.2 Auditoria de Promoção em `itens_venda`

**Migration nova**: Adicionar coluna de rastreabilidade

```sql
-- Na migration 273
ALTER TABLE public.itens_venda
  ADD COLUMN IF NOT EXISTS regra_aplicada_id UUID REFERENCES public.regras_preco(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS desconto_regra_percentual NUMERIC(10,4);
```

### 8.3 (Opcional) Índices de Performance

```sql
-- Busca rápida de promoções ativas por produto
CREATE INDEX IF NOT EXISTS idx_regras_preco_ativas_produto 
  ON public.regras_preco(produto_id) 
  WHERE ativo = true AND (data_validade IS NULL OR data_validade > now());

-- Busca rápida de promoções ativas por categoria
CREATE INDEX IF NOT EXISTS idx_regras_preco_ativas_categoria 
  ON public.regras_preco(categoria_id) 
  WHERE ativo = true AND (data_validade IS NULL OR data_validade > now());
```

---

## 9. RPCs Afetadas

| RPC | Mudança | Impacto | Esforço |
|-----|---------|--------|--------|
| `calcular_preco_produto` | Nenhuma (mantém SSOT) | Nenhum | — |
| `finalizar_venda_transacional_canonica_v4` | Aceitar `tipo_preco='PROMOCAO'` | Revalidação de preço | Baixo |
| **Nova**: `aplicar_promocoes_carrinho` | Buscar + aplicar regras (TBD) | Otimização frontend | Médio |

---

## 10. Riscos Identificados

### 10.1 Risco P0: Duplicação de Lógica de Preço

**Cenário**: Frontend e backend calculam promoção diferente.

**Mitigation**:
- ✅ Manter SSOT em backend (RPC revalida)
- ✅ Usar mesmo `PricingService` no frontend e backend? (TBD)
- ❌ Não permitir frontend aplicar promo unilateralmente

### 10.2 Risco P1: Quebra de Auditoria

**Cenário**: Promoção aplicada, mas não registrada em `itens_venda.regra_aplicada_id`.

**Mitigation**:
- ✅ Adicionar coluna `regra_aplicada_id` (migration 273)
- ✅ Frontend envia `rule_id` ao RPC
- ✅ RPC insere em `itens_venda` obrigatoriamente

### 10.3 Risco P2: Limite de Desconto Total não Respeitado

**Cenário**: Promo 30% + desconto manual 20% + desconto gerente 20% = 70% total.

**Mitigation**:
- ✅ RPC valida: `(desconto_total / total_bruto) ≤ 0.60` (configurável)
- ✅ Rejeita se exceder

---

## 11. Preservação de Invariantes (Obrigatórios)

| Invariante | Status | Solução |
|----------|--------|---------|
| **SSOT de Preço** | ✅ Preservado | RPC revalida antes de finalizar |
| **Sem Duplicação de Regra Frontend** | ✅ Garantido | Apenas exibe, não calcula |
| **UnifiedCartStore Intacto** | ✅ Preservado | Adicionar `promoAplicadas`, não modificar estrutura |
| **Fluxo de Finalização Intacto** | ✅ Preservado | Adicionar validação, não mudar ordem |
| **Auditoria Completa** | ✅ Preservado | Adicionar `regra_aplicada_id` em `itens_venda` |
| **Compatibilidade Backward** | ✅ Garantida | Nova migração, DEFAULTs, versioning |

---

## 12. Conclusão e Próximos Passos

### Status Atual
- ✅ Infraestrutura 70% pronta (`regras_preco` tabela + `PricingService`)
- ❌ Bloqueador crítico: Schema não suporta `tipo_preco='PROMOCAO'`
- ⚠️ Integração frontend-backend não implementada

### Recomendações

1. **Imediato** (Bloqueador):
   - Criar migration #273 para adicionar 'PROMOCAO' ao CHECK
   - Adicionar colunas de auditoria (`regra_aplicada_id`, `desconto_regra_percentual`)

2. **Curto Prazo** (Planejamento):
   - Definir precedência: Promoção como desconto manual ou tipo de preço distinto?
   - Definir regra de acumulação de descontos (sequencial ou máximo?)
   - Especificar limite total de desconto

3. **Médio Prazo** (Implementação):
   - Integrar busca de regras ao `unifiedCartStore`
   - Adicionar validação de piso em RPC
   - Implementar UI para gerente criar/gerenciar promoções

4. **Antes de Go-Live**:
   - E2E tests cobrem 10+ cenários (promo + desconto gerente)
   - Auditoria valida promoção em `itens_venda`

---

**Data de Entrega**: 2026-07-24  
**Próximo Doc**: BL2_PLANO_IMPLEMENTACAO.md (roadmap detalhado)
