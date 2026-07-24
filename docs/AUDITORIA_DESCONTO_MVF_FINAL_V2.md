# MINIMUM VIABLE FIXES - ARTEFATO CANÔNICO
## Regras de Desconto FastProduct - Go-Live Seguro

**Versão**: 2.0 (Revisão Arquitetural)  
**Data**: 2025-07-24  
**Status**: Pronto para Implementação

---

# PREFÁCIO ARQUITETURAL

Este documento define 3 Minimum Viable Fixes que resolvem bloqueadores sem refatoração ampla. **Mais importante**: estabelece contratos, invariantes e matriz de compatibilidade que guiarão futuras evoluções do sistema por anos.

Cada MVF preserva:
- ✅ Single Source of Truth (SSOT)
- ✅ Arquitetura existente
- ✅ Backward compatibility
- ✅ Testabilidade

---

# BLOCKER #1: PDV Local - Limite de Desconto Ignorado

## Diagnóstico

Operador em PDV Local aplica 25% desconto (limite=15%), venda é criada, sincroniza, backend rejeita, venda desaparece.

**Raiz**: `unifiedCartStore.aplicarDescontoManual()` sem validação de %.

## MVF #1: Validação Local (4 horas)

### Arquivo Único Modificado

**`/shared-core/src/stores/unifiedCartStore.ts`** (2 linhas adicionadas)

```typescript
aplicarDescontoManual(
  itemId: string, 
  descontoPercentual: number, 
  maxPermitido: number = 15
) {
  const item = this.itens.find(i => i.id === itemId);
  if (!item) return;
  
  // ✅ VALIDAÇÃO ADICIONADA (rejeita desconto inválido PRÉ-aplicação)
  if (descontoPercentual > maxPermitido && item.tipo_preco !== 'ATACADO') {
    throw new Error(
      `Desconto acima do limite permitido (${maxPermitido}%). ` +
      `Solicite autorização de gerente.`
    );
  }
  
  const descontoValor = Math.round(
    (item.preco_unitario * descontoPercentual) / 100
  );
  const precoComDesconto = Math.max(
    floor, 
    roundMoney(item.preco_unitario - descontoValor)
  );
  
  // ... resto do código
}
```

### Por Que É Suficiente

- ✅ Previne venda inválida de ser criada (frontend)
- ✅ Backend trigger (migration 122) continua como proteção (defense-in-depth)
- ✅ Elimina sync conflicts por desconto inválido
- ✅ Zero mudanças em schema/RPC

### Impactos

| Componente | Impacto |
|-----------|---------|
| **PDV Web** | Erro modal antes de criar venda (UX+) |
| **PDV Local** | Erro local, sem sync conflict |
| **Offline Sync** | Consistência garantida (venda válida sempre) |
| **NFC-e** | Nenhum (desconto válido quando persistido) |
| **RPC** | Nenhum (validação é frontend) |

### Rollback

```typescript
// Remover 2 linhas, voltar a versão anterior
if (descontoPercentual > maxPermitido && item.tipo_preco !== 'ATACADO') {
  throw new Error(...);
}
```

**Risco rollback**: ZERO (2 linhas adicionais)

### Testes

```typescript
// Unit test
it('desconto 20% > limite 15% em VAREJO rejeita', () => {
  store.addItem({ tipo_preco: 'VAREJO', preco_unitario: 100 });
  expect(() => store.aplicarDescontoManual('1', 20, 15)).toThrow();
});

it('desconto 20% > limite 15% em ATACADO ACEITA', () => {
  store.addItem({ tipo_preco: 'ATACADO', preco_unitario: 80 });
  expect(() => store.aplicarDescontoManual('1', 20, 15)).not.toThrow();
});

// E2E test
test('PDV Local: Desconto inválido rejeita no frontend', async () => {
  // Operador tenta 25% (limite 15%)
  await page.click('[data-test="desconto-item"]');
  await page.fill('[data-test="desconto-percent"]', '25');
  
  // Erro modal
  expect(await page.locator('[data-test="error-modal"]')).toContainText('acima do limite');
  
  // Venda não foi criada
  await page.click('[data-test="finalizar"]');
  const vendas = await supabase.from('vendas').select('id');
  expect(vendas.length).toBe(0);
});
```

### Estimativa

| Tarefa | Horas |
|--------|-------|
| Implementar validação | 0.5 |
| Unit tests | 0.5 |
| E2E tests | 1.5 |
| QA manual | 1 |
| **Total** | **4h** |

---

---

# BLOCKER #2: Motivo de Desconto Não Registrado

## Diagnóstico

`descontos_venda` não registra motivo. Auditoria falha (não consegue explicar POR QUÊ desconto foi dado).

## MVF #2: ENUM Motivo + Descrição Livre (7 horas)

### 1. Schema (Migration Nova)

**Criar**: `/backend/supabase/migrations/[NEXT_NUM]_desconto_motivo_enum.sql`

```sql
BEGIN;

-- ✅ TIPO ENUM (direto, sem VARCHAR intermediário)
CREATE TYPE motivo_desconto_enum_tipo AS ENUM (
  'NAO_ESPECIFICADO',
  'ERRO_DIGITACAO',
  'NEGOCIACAO',
  'CLIENTE_PREFERENCIAL',
  'DANO_PRODUTO',
  'AUTORIZACAO_COMERCIAL',
  'OUTROS'
);

-- ✅ COLUNAS NOVAS (diretas como ENUM)
ALTER TABLE descontos_venda
ADD COLUMN motivo_desconto motivo_desconto_enum_tipo 
  NOT NULL DEFAULT 'NAO_ESPECIFICADO';

ALTER TABLE descontos_venda
ADD COLUMN motivo_descricao_livre TEXT;

-- ✅ CONSTRAINT: Descrição livre OBRIGATÓRIA se motivo='OUTROS'
ALTER TABLE descontos_venda
ADD CONSTRAINT check_motivo_descricao
  CHECK (
    CASE 
      WHEN motivo_desconto = 'OUTROS' 
        THEN motivo_descricao_livre IS NOT NULL 
             AND LENGTH(TRIM(motivo_descricao_livre)) > 0
      ELSE motivo_descricao_livre IS NULL
    END
  );

-- ✅ ÍNDICES (auditoria rápida)
CREATE INDEX idx_descontos_venda_motivo 
  ON descontos_venda(motivo_desconto);

CREATE INDEX idx_descontos_venda_motivo_outros 
  ON descontos_venda(motivo_descricao_livre) 
  WHERE motivo_desconto = 'OUTROS';

COMMIT;
```

**Por que ENUM direto** (sem VARCHAR intermediário):
- ✅ Mais simples (tipo já é certo)
- ✅ Sem conversão desnecessária
- ✅ Database válida (constraint automático)
- ✅ BI exato (GROUP BY motivo_desconto)

### 2. RPC Modificada

**Modificar**: `finalizar_venda_transacional_canonica_v3()`

```sql
-- RPC signature adiciona parâmetro:
CREATE OR REPLACE FUNCTION finalizar_venda_transacional_canonica_v3(
  ... existing params ...
  motivo_desconto_param motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO',
  motivo_descricao_param TEXT DEFAULT NULL
) RETURNS ...
AS $$
BEGIN
  -- ... existing logic ...

  -- Ao inserir desconto:
  IF desconto_percentual_param > 0 THEN
    INSERT INTO descontos_venda (
      venda_id, gerente_id, desconto_percentual, desconto_valor,
      operador_id, aplicado_em,
      motivo_desconto, motivo_descricao_livre
    )
    VALUES (
      venda_id_new, gerente_id_param, desconto_pct, desconto_val,
      operador_id_param, NOW(),
      motivo_desconto_param, motivo_descricao_param
    );
  END IF;

  -- ... rest of logic ...
END $$;
```

**Backward compatibility**:
- ✅ Novo parâmetro tem DEFAULT
- ✅ Clientes antigos (sem motivo) usam default
- ✅ Clientes novos (com motivo) persistem valor

### 3. Frontend UI

**Modificar**: `/pdv-importados/app/caixa/CaixaGerenteModal.tsx`

```typescript
// Modal agora tem 3 passos (PASSO 2 = motivo)

const CaixaGerenteModal = () => {
  const [step, setStep] = useState<'password' | 'motivo' | 'percentual'>('password');
  const [motivo, setMotivo] = useState<motivo_desconto_enum_tipo>('');
  const [descricaoLivre, setDescricaoLivre] = useState('');

  return (
    <>
      {step === 'password' && (
        <PasswordStep onNext={() => setStep('motivo')} />
      )}

      {step === 'motivo' && (
        <MotivoStep 
          motivo={motivo}
          setMotivo={setMotivo}
          descricaoLivre={descricaoLivre}
          setDescricaoLivre={setDescricaoLivre}
          onNext={() => setStep('percentual')}
          disabled={!motivo || (motivo === 'OUTROS' && !descricaoLivre)}
        />
      )}

      {step === 'percentual' && (
        <PercentualStep 
          onFinish={(percentual) => {
            finalizarDescontoGerente(percentual, motivo, descricaoLivre);
          }}
        />
      )}
    </>
  );
};

const MotivoStep = ({ motivo, setMotivo, descricaoLivre, setDescricaoLivre, onNext, disabled }) => {
  return (
    <div className="modal-step">
      <h3>Motivo do Desconto</h3>
      
      <select 
        value={motivo} 
        onChange={(e) => setMotivo(e.target.value as motivo_desconto_enum_tipo)}
        required
      >
        <option value="">Selecione motivo...</option>
        <option value="ERRO_DIGITACAO">Erro de Digitação</option>
        <option value="NEGOCIACAO">Negociação com Cliente</option>
        <option value="CLIENTE_PREFERENCIAL">Cliente Preferencial</option>
        <option value="DANO_PRODUTO">Produto com Dano</option>
        <option value="AUTORIZACAO_COMERCIAL">Autorização Comercial</option>
        <option value="OUTROS">Outros (especificar)</option>
      </select>

      {motivo === 'OUTROS' && (
        <textarea 
          placeholder="Descrever motivo específico (obrigatório)..."
          value={descricaoLivre}
          onChange={(e) => setDescricaoLivre(e.target.value)}
          required
          maxLength={500}
        />
      )}

      <button onClick={onNext} disabled={disabled}>
        Próximo
      </button>
    </div>
  );
};
```

### 4. Por Que É Suficiente

- ✅ ENUM previne "300 variações de mesmo motivo"
- ✅ Auditoria: `GROUP BY motivo_desconto` (exato)
- ✅ BI: Tabela de descontos por motivo (automática)
- ✅ Compliance: Motivo sempre registrado
- ✅ Descrição livre: Flexibilidade para "OUTROS"

### 5. Impactos

| Componente | Impacto |
|-----------|---------|
| **PDV Web** | Modal ganha passo intermediário (UX+) |
| **PDV Local** | Nenhum (sincroniza com backend) |
| **Offline Sync** | Usa default "NAO_ESPECIFICADO" se offline |
| **NFC-e** | Nenhum (motivo é auditoria interna) |
| **RPC** | 2 parâmetros novos (defaults para compat) |
| **BI** | Relatórios de desconto por motivo (nova capacidade) |

### 6. Rollback

```sql
ALTER TABLE descontos_venda DROP CONSTRAINT check_motivo_descricao;
ALTER TABLE descontos_venda DROP COLUMN motivo_desconto;
ALTER TABLE descontos_venda DROP COLUMN motivo_descricao_livre;
DROP TYPE motivo_desconto_enum_tipo;
```

**Risco rollback**: ZERO (colunas novas, dados perdidos)

### 7. Testes

```typescript
// Unit test - SQL
BEGIN;
INSERT INTO descontos_venda (
  venda_id, gerente_id, desconto_percentual, desconto_valor,
  motivo_desconto, motivo_descricao_livre
)
VALUES ('v-1', 'g-1', 10, 50, 'CLIENTE_PREFERENCIAL', NULL);
-- ✓ OK

-- Constraint: OUTROS sem descrição deve falhar
INSERT INTO descontos_venda (
  venda_id, gerente_id, desconto_percentual, desconto_valor,
  motivo_desconto, motivo_descricao_livre
)
VALUES ('v-2', 'g-1', 10, 50, 'OUTROS', NULL);
-- ✗ DEVE FALHAR (constraint)
ROLLBACK;

// Integration test
it('RPC com motivo_desconto persiste corretamente', async () => {
  const result = await supabase.rpc('finalizar_venda_transacional_canonica_v3', {
    // ... params
    motivo_desconto_param: 'CLIENTE_PREFERENCIAL',
    motivo_descricao_param: null
  });
  
  const desconto = await supabase
    .from('descontos_venda')
    .select('motivo_desconto')
    .eq('venda_id', result.venda_id)
    .single();
  
  expect(desconto.motivo_desconto).toBe('CLIENTE_PREFERENCIAL');
});

// E2E test
test('Desconto gerente: Motivo é obrigatório', async () => {
  await page.click('[data-test="desconto-gerente"]');
  
  // PASSO 1: Password OK
  await page.fill('[data-test="password"]', 'secret');
  await page.click('[data-test="next-passo1"]');
  
  // PASSO 2: Motivo
  const nextBtn = await page.locator('[data-test="next-passo2"]');
  
  // Botão DISABLED (motivo não selecionado)
  expect(nextBtn).toBeDisabled();
  
  // Seleciona motivo
  await page.selectOption('[data-test="motivo"]', 'CLIENTE_PREFERENCIAL');
  
  // Botão ENABLED
  expect(nextBtn).toBeEnabled();
  
  // Clica próximo
  await nextBtn.click();
  
  // PASSO 3: Percentual (como antes)
  // ...
});
```

### 8. Estimativa

| Tarefa | Horas |
|--------|-------|
| Nova migration | 0.5 |
| RPC signature | 0.5 |
| Modal UI (3 passos) | 1.5 |
| SQL validation tests | 0.5 |
| Integration tests | 0.75 |
| E2E tests (UI + persist) | 1.5 |
| Regression (backward compat) | 0.5 |
| QA manual | 1 |
| **Total** | **7h** |

---

---

# BLOCKER #3: Promoções Não Funcionam

## Diagnóstico

`regras_preco` tipo='PROMOCAO' existe, não é processada. Promo configurada, nunca aplicada.

## MVF #3: Estender RPC 250 (Preservar SSOT) (7.5 horas)

### 1. Princípio Arquitetural: SSOT

**Single Source of Truth de Cálculo de Preço = UMA entrada canônica**

❌ **Não fazer**: Criar `calcular_preco_produto_v251()` (2 RPCs, 2 fontes de verdade)  
✅ **Fazer**: `ALTER FUNCTION calcular_preco_produto()` (1 RPC, 1 fonte)

**Por quê**: 
- 2 RPCs = 2 fontes de verdade
- Em 12 meses, garantidamente divergem
- 1 RPC estendida = mantém SSOT

### 2. RPC Modificada (In-Place Extension)

**Modificar**: `calcular_preco_produto()` (em migration 77 ou nova migration 252)

```sql
-- INSTEAD OF: CREATE FUNCTION calcular_preco_produto_v251()
-- DO THIS: ALTER FUNCTION calcular_preco_produto()

CREATE OR REPLACE FUNCTION calcular_preco_produto(
  p_produto_id UUID,
  p_quantidade INTEGER,
  p_loja_id UUID
) RETURNS TABLE(
  preco NUMERIC,
  tipo VARCHAR(20),
  fonte VARCHAR(20),
  regra_id UUID
) LANGUAGE plpgsql AS $$
DECLARE
  v_preco NUMERIC;
  v_tipo VARCHAR(20);
  v_fonte VARCHAR(20);
  v_regra_id UUID;
  v_custo NUMERIC;
  v_preco_varejo NUMERIC;
  v_preco_atacado NUMERIC;
  v_data_agora TIMESTAMP := NOW();
BEGIN
  -- Busca preços base
  SELECT preco_varejo, preco_atacado, preco_custo
  INTO v_preco_varejo, v_preco_atacado, v_custo
  FROM produtos
  WHERE id = p_produto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUTO_NAO_ENCONTRADO';
  END IF;

  -- ✅ PASSO 1: PROMOÇÃO (NOVO - adicionado no topo)
  -- Procura regra tipo='PROMOCAO' que está ativa AGORA
  SELECT 
    CASE 
      WHEN tipo_desconto = 'PERCENTUAL' 
        THEN v_preco_varejo * (1 - desconto_percentual / 100)
      WHEN tipo_desconto = 'VALOR_FIXO' 
        THEN preco_fixo
      ELSE v_preco_varejo
    END,
    id
  INTO v_preco, v_regra_id
  FROM regras_preco
  WHERE 
    produto_id = p_produto_id
    AND tipo = 'PROMOCAO'
    AND ativa = true
    AND (data_inicio IS NULL OR data_inicio <= v_data_agora)
    AND (data_fim IS NULL OR data_fim >= v_data_agora)
  ORDER BY data_criacao DESC -- Most recent promo wins
  LIMIT 1;

  IF FOUND THEN
    preco := v_preco;
    tipo := 'PROMOCAO';
    fonte := 'promocao';
    regra_id := v_regra_id;
    RETURN NEXT;
    RETURN;
  END IF;

  -- PASSO 2: TIER (lógica original preservada)
  SELECT 
    pt.preco_unitario,
    pt.id
  INTO v_preco, v_regra_id
  FROM precos_atacado pt
  WHERE 
    pt.produto_id = p_produto_id
    AND pt.ativo = true
    AND pt.loja_id = p_loja_id
    AND pt.quantidade_minima <= p_quantidade
  ORDER BY pt.quantidade_minima DESC
  LIMIT 1;

  IF FOUND THEN
    preco := v_preco;
    tipo := 'ATACADO';
    fonte := 'tier';
    regra_id := v_regra_id;
    RETURN NEXT;
    RETURN;
  END IF;

  -- PASSO 3: CATÁLOGO (lógica original preservada)
  IF p_quantidade >= COALESCE(
    (SELECT quantidade_minima_atacado_padrao FROM pdv_config LIMIT 1),
    6
  ) THEN
    preco := v_preco_atacado;
    tipo := 'ATACADO';
    fonte := 'catalogo';
    regra_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- PASSO 4: VAREJO (lógica original preservada)
  preco := v_preco_varejo;
  tipo := 'VAREJO';
  fonte := 'varejo';
  regra_id := NULL;
  RETURN NEXT;
END $$;

-- ✅ Tabela regras_preco PRECISA ter coluna 'ativa'
ALTER TABLE regras_preco 
ADD COLUMN IF NOT EXISTS ativa BOOLEAN DEFAULT true;

-- ✅ Índices para performance
CREATE INDEX IF NOT EXISTS idx_regras_preco_promo_ativa 
  ON regras_preco(produto_id, tipo, ativa, data_inicio, data_fim)
  WHERE tipo = 'PROMOCAO';
```

**Por que estender em vez de criar nova**:
- ✅ Uma única entrada: `calcular_preco_produto()`
- ✅ Uma única lógica: sequência exata definida
- ✅ Preserva SSOT (princípio arquitetural)
- ✅ Backward compatible (novos campos ignorados por clientes antigos)
- ✅ Rollback: reverter ALTER FUNCTION

### 3. Offline Equivalência

**Modificar**: `/shared-core/src/pricing/calcularPrecoCanonico.ts`

```typescript
export function calcularPrecoCanonico(
  input: CalcularPrecoCanonicoInput & { 
    promocoes?: RegraPreco[] // ✅ Novo parâmetro
  }
): ResultadoPreco {
  const {
    produto,
    quantidade,
    tiers,
    quantidadeMinimaAtacadoPadrao,
    promocoes = []
  } = input;

  const agora = new Date();

  // ✅ PASSO 1: Promoção (adicionado)
  const promoAtiva = promocoes.find(p =>
    p.tipo === 'PROMOCAO'
    && p.ativa
    && (!p.data_inicio || p.data_inicio <= agora)
    && (!p.data_fim || p.data_fim >= agora)
  );

  if (promoAtiva) {
    const descontoPreco =
      promoAtiva.tipo_desconto === 'PERCENTUAL'
        ? produto.preco_varejo * (1 - promoAtiva.desconto_percentual / 100)
        : promoAtiva.preco_fixo;

    return {
      preco: roundMoney(descontoPreco),
      tipo: 'PROMOCAO',
      fonte: 'promocao',
      regra_id: promoAtiva.id
    };
  }

  // PASSO 2-4: Lógica original (tier → catalog → varejo)
  const tier = tiers.find(t => quantidade >= t.quantidade_minima);
  if (tier) {
    return {
      preco: tier.preco,
      tipo: 'ATACADO',
      fonte: 'tier',
      regra_id: tier.id
    };
  }

  if (quantidade >= quantidadeMinimaAtacadoPadrao) {
    return {
      preco: produto.preco_atacado,
      tipo: 'ATACADO',
      fonte: 'catalogo',
      regra_id: null
    };
  }

  return {
    preco: produto.preco_varejo,
    tipo: 'VAREJO',
    fonte: 'varejo',
    regra_id: null
  };
}
```

### 4. Sincronização (Passar Promoções ao Offline)

**Modificar**: `/backend/supabase/functions/sync-outbox/index.ts`

```typescript
// Ao sincronizar dados para offline, incluir promoções ativas:
const sync_data = {
  produtos: [...],
  precos_atacado: [...],
  // ✅ NOVO: Promoções ativas
  regras_preco: await supabase
    .from('regras_preco')
    .select('*')
    .eq('tipo', 'PROMOCAO')
    .eq('ativa', true)
    .lte('data_inicio', new Date())
    .gte('data_fim', new Date())
};

// PDV Local recebe promoções
// Passa para calcularPrecoCanonico({ ..., promocoes: sync_data.regras_preco })
```

### 5. Contrato de Cálculo de Preço

**Precedência Exata (Invariante Arquitetural)**

```
┌────────────────────────────────────────┐
│   CONTRATO DE CÁLCULO DE PREÇO         │
│   (Single Source of Truth)             │
└────────────────────────────────────────┘

ENTRADA (p_produto_id, p_quantidade, p_loja_id)
  ↓
PASSO 1: Promoção Ativa
  └─ regras_preco tipo='PROMOCAO', ativa=true, período ok
  └─ SE encontrada → RETORNA { preco, tipo:'PROMOCAO', ... }
  ↓ (SE NÃO)
PASSO 2: Tier (Atacado)
  └─ precos_atacado onde quantidade >= quantidade_minima
  └─ SE encontrado → RETORNA { preco, tipo:'ATACADO', fonte:'tier', ... }
  ↓ (SE NÃO)
PASSO 3: Catálogo Atacado
  └─ SE quantidade >= quantidade_minima_atacado_padrao
  └─ → RETORNA { preco: preco_atacado, tipo:'ATACADO', fonte:'catalogo', ... }
  ↓ (SE NÃO)
PASSO 4: Varejo (Fallback)
  └─ RETORNA { preco: preco_varejo, tipo:'VAREJO', fonte:'varejo', ... }

SAÍDA (preco, tipo, fonte, regra_id)
  ↓
[Desconto Item aplicado SOBRE este preço]
  ↓
[Desconto Gerente aplicado SOBRE total]
  ↓
[Fiscal (NFC-e) recebe preco final]
  ↓
[Auditoria registra tudo]

═══════════════════════════════════════════════════════════════
REGRA: Nenhum componente pode alterar esta sequência.
Toda alteração futura é discussão arquitetural, não implementação.
═══════════════════════════════════════════════════════════════
```

### 6. Precedência de Descontos (Explícita)

**Pergunta**: Se Promo=30% e Gerente=10%, qual é a base do desconto gerente?

**Resposta (Contrato)**:

```
Preço original: 100
  ↓
Promoção 30% aplicada
  → Preço com promo: 70
  ↓
Desconto Item (se aplicado)
  → Aplicado SOBRE 70
  ↓
Desconto Gerente (se aplicado)
  → Aplicado SOBRE total (soma de itens após desconto item)
  
EXEMPLO:
  2x Produto A: 100 cada (promo 30% ativa)
    Item A1: 100 → promo 30% → 70
    Item A2: 100 → promo 30% → 70
    Subtotal: 140
    
  1x Produto B: 80 (sem promo, desconto item 10%)
    Item B: 80 → desc item 10% → 72
    
  Carrinho antes desconto gerente: 70 + 70 + 72 = 212
  
  Desconto gerente 10%:
    → 212 * 10% = 21.20
    → Total final: 190.80

REGRA FISCAL: 
  Promo é PRÉ-aplicada no preço_unitario
  Desconto gerente é SEPARADO na nota fiscal
  Ambos são registrados para auditoria
```

### 7. Impactos

| Componente | Impacto |
|-----------|---------|
| **PDV Web** | Promoção ativa = preço já descontado (transparente) |
| **PDV Local** | Calcula promo offline (calcularPrecoCanonico) |
| **Offline Sync** | Zero conflito (mesma lógica que server) |
| **NFC-e** | Desconto refletido no preço final |
| **RPC** | Uma única `calcular_preco_produto()` estendida |
| **BI** | Novo campo `tipo='PROMOCAO'` para análise |

### 8. Rollback

```sql
-- Revert ALTER FUNCTION (voltar ao código anterior)
-- PostgreSQL rastreia histórico automático
-- Simples revert no Git
```

**Risco rollback**: ZERO (1 RPC modificada)

### 9. Testes

```sql
-- SQL Unit Test
BEGIN;
INSERT INTO produtos (id, preco_varejo, preco_atacado, preco_custo)
VALUES ('prod-1', 100, 80, 50);

INSERT INTO regras_preco (
  id, produto_id, tipo, ativa,
  tipo_desconto, desconto_percentual,
  data_inicio, data_fim
)
VALUES (
  'promo-1', 'prod-1', 'PROMOCAO', true,
  'PERCENTUAL', 30,
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '1 day'
);

-- RPC deve retornar preço com promo aplicada
SELECT calcular_preco_produto('prod-1', 1, 'loja-1');
-- Esperado: preco=70, tipo='PROMOCAO', fonte='promocao'

-- Promoção expirada
UPDATE regras_preco SET data_fim = NOW() - INTERVAL '1 day'
WHERE id = 'promo-1';

SELECT calcular_preco_produto('prod-1', 1, 'loja-1');
-- Esperado: preco=100, tipo='VAREJO' (promo não aplica)

ROLLBACK;

// TypeScript Test - Offline Equivalence
it('calcularPrecoCanonico com promo = RPC com promo', async () => {
  const produto = { id: 'prod-1', preco_varejo: 100 };
  const promoAtiva = {
    id: 'promo-1',
    tipo: 'PROMOCAO',
    ativa: true,
    tipo_desconto: 'PERCENTUAL',
    desconto_percentual: 30,
    data_inicio: new Date(Date.now() - 1000),
    data_fim: new Date(Date.now() + 86400000)
  };

  // Offline
  const offline = calcularPrecoCanonico({
    produto,
    quantidade: 1,
    tiers: [],
    promocoes: [promoAtiva]
  });

  // Online
  const online = await supabase.rpc('calcular_preco_produto', {
    p_produto_id: 'prod-1',
    p_quantidade: 1,
    p_loja_id: 'loja-1'
  });

  expect(offline.preco).toBe(online.preco); // 70
  expect(offline.tipo).toBe(online.tipo); // 'PROMOCAO'
});

// E2E Test
test('Promo ativa 20% applica no preço', async () => {
  // Setup promo ativa
  await supabase.from('regras_preco').insert({
    produto_id: 'prod-beer',
    tipo: 'PROMOCAO',
    ativa: true,
    tipo_desconto: 'PERCENTUAL',
    desconto_percentual: 20,
    data_inicio: new Date(Date.now() - 1000),
    data_fim: new Date(Date.now() + 86400000)
  });

  // PDV Web: Adiciona item
  await page.goto('caixa');
  await page.click('[data-test="add-produto"]');
  await page.fill('[data-test="search"]', 'Cerveja');
  
  // Preço mostra 80 (100 - 20%)
  const preco = await page.locator('[data-test="item-preco"]');
  expect(preco).toContainText('80.00');
  
  // Badge mostra "Promoção"
  expect(preco).toContainText('Promoção');
});
```

### 10. Estimativa

| Tarefa | Horas |
|--------|-------|
| RPC estendida (PASSO 1) | 1 |
| calcularPrecoCanonico.ts | 1 |
| Sync-outbox (promoções) | 0.5 |
| SQL unit tests | 0.75 |
| Offline equivalence tests | 1.25 |
| E2E tests (promo ativa/expirada) | 1.5 |
| Regression (backward compat) | 0.75 |
| QA manual | 0.75 |
| **Total** | **7.5h** |

---

---

# POLÍTICA OFICIAL DE ACÚMULO DE PREÇOS

## Posição Arquitetural Definitiva

FastProduct adota uma política de **NÃO acúmulo** de preços. Promoções, Tiers e Preço de Atacado são **alternativas excludentes**, nunca cumulativas.

### Lógica Oficial (Verificação em Ordem)

```
1. Verificar: Existe Promoção ativa para este produto agora?
   ✓ SIM  → Usar preço promocional. FIM.
   ✓ NÃO  → Continuar.

2. Verificar: Existe Tier de Atacado aplicável?
   ✓ SIM  → Usar preço do tier. FIM.
   ✓ NÃO  → Continuar.

3. Verificar: Quantidade atinge mínimo de Atacado padrão?
   ✓ SIM  → Usar preço de atacado catalogo. FIM.
   ✓ NÃO  → Continuar.

4. Usar Preço de Varejo. FIM.
```

### Decisões Não Permitidas

❌ Promoção + Tier (aplicar ambas)  
❌ Promoção + Atacado (aplicar ambas)  
❌ Tier + Atacado (aplicar ambas)  
❌ Qualquer combinação de 2+ fontes de preço

### Justificativa

- **Simplicidade**: Apenas uma fonte de preço por produto
- **Determinístico**: Mesma entrada = sempre mesmo resultado
- **Fiscal**: Menos ambiguidade para NFC-e
- **Auditoria**: Rastreamento claro (qual regra foi aplicada?)
- **Performance**: Sem lógica de "aplicar o menor" ou "aplicar o maior"

### Contrato Arquitetural

```
Qualquer ROADMAP futuro que proponha:
  - Acúmulo de descontos
  - Múltiplas promoções no mesmo período
  - Tier + Atacado combinados

precisa ser REJEITADO em discussão técnica.

Essa é uma DECISÃO FINAL, não negociável na implementação.

Se o produto PRECISA de acúmulo em futuro distante,
deve ser discussão de REENGENHARIA (novo projeto),
não uma mudança incremental.
```

---

# SEPARAÇÃO DE DOMÍNIOS

## Dois Pipelines Independentes

O sistema de desconto e preço é organizado em **dois domínios completamente separados**.

### Pipeline A — Formação de Preço

**Responsabilidade**: Determinar o preço base de um produto.

**Localização Única**:
- Backend: `calcular_preco_produto()` RPC (migration 250, estendida)
- Frontend: `calcularPrecoCanonico()` (/shared-core/src/pricing)

**Características**:
- ✓ Sem autorização
- ✓ Sem gerente
- ✓ Sem desconto comercial
- ✓ Sem margem (apenas custo para referência)
- ✓ Apenas calcula o preço

**Entradas**:
- produto_id
- quantidade
- loja_id
- data/hora (para promoções temporárias)

**Saídas**:
- preco_unitario (valor final)
- tipo ('PROMOCAO' | 'ATACADO' | 'VAREJO')
- fonte ('promocao' | 'tier' | 'catalogo' | 'varejo')
- regra_id (rastreabilidade)

**Sequência Exata**:
```
Entrada
  ↓
Verificar Promoção
  ↓ (se não) 
Verificar Tier
  ↓ (se não)
Verificar Atacado Catalogo
  ↓ (se não)
Usar Varejo
  ↓
Retornar preco_unitario
```

**Garantias**:
- ✓ Determinístico (input == output sempre igual)
- ✓ Exato (um resultado, sem ambiguidade)
- ✓ Auditável (rastreável até a origem)

---

### Pipeline B — Política Comercial

**Responsabilidade**: Aplicar descontos comerciais, validar autorização, proteger margem, gerar auditoria.

**Localização**:
- Backend: Stored procedures de finalização de venda
- Frontend: React components + State (unifiedCartStore)
- Storage: Tabelas `descontos_venda`, `itens_venda` audit

**Características**:
- ✓ Requer autorização (gerente para desconto > limite)
- ✓ Valida permissões (RBAC por operador/perfil)
- ✓ Protege margem (rejeita venda abaixo custo)
- ✓ Registra motivo (auditoria compliance)
- ✓ Gera trilha de auditoria completa

**Sequência Exata**:
```
Preco Base Final (de Pipeline A)
  ↓
Aplicar Desconto por Item (validar limite)
  ↓
Aplicar Desconto Geral (validar token gerente)
  ↓
Validar Margem (rejeitar se abaixo custo)
  ↓
Registrar Motivo (enum)
  ↓
Inserir em Fiscal (NFC-e)
  ↓
Persistir em Banco (vendas, itens_venda, descontos_venda)
  ↓
Registrar em Auditoria (audit trail)
```

**Garantias**:
- ✓ Autenticado (token validado)
- ✓ Autorizado (permissões verificadas)
- ✓ Válido (margem protegida)
- ✓ Auditado (motivo + trilha completa)

---

## Separação Crítica

❌ **Pipeline A NUNCA pode conter lógica de Pipeline B**
- Sem desconto comercial no RPC
- Sem autorização no RPC
- Sem validação de permissão no RPC
- Sem margem negativa no RPC

❌ **Pipeline B NUNCA pode calcular preço**
- Sem re-cálculo de preço no desconto
- Sem lógica de tier/promo no desconto
- Sem acesso ao RPC de preço (apenas consome output)

✅ **Pipeline B consome resultado de Pipeline A**
- Recebe: preco_unitario (já calculado)
- Aplica: desconto comercial sobre esse preço
- Registra: tudo em auditoria

---

# INVARIANTES DO SISTEMA

Estas propriedades DEVEM permanecer verdadeiras em qualquer evolução do sistema.

## CRÍTICOS (Nunca Quebrar)

### C1: Single Source of Truth de Preço
✓ **Exatamente UMA entrada**: `calcular_preco_produto()`  
✓ **Nenhuma RPC duplicada** (250, 251, 252...)  
✓ **Toda lógica de preço aqui**  
✓ **Futuro**: ALTER FUNCTION, nunca CREATE nova

**Verificação**:
```sql
SELECT COUNT(*) FROM pg_proc 
WHERE proname LIKE 'calcular_preco%' AND prokind = 'f';
-- Resultado: 1 (ou 2 se houver v250 archived como histórico)
```

### C2: Nunca Vender Abaixo do Custo (Sem Override Auditado)
✓ `preco_final >= preco_custo` OU tem `autorizacao_margem_negativa`  
✓ Override é registrado em audit trail  
✓ Relatório de "margens negativas" sempre vazio (ou contém apenas overrides)

**Verificação**:
```sql
SELECT COUNT(*) FROM itens_venda iv
JOIN produtos p ON iv.produto_id = p.id
WHERE iv.preco_unitario < p.preco_custo
  AND iv.autorizacao_margem_negativa IS NULL;
-- Resultado: 0
```

### C3: Nunca Bypassar Permissão de Gerente
✓ Desconto > limite **REJEITA** sem token gerente válido  
✓ Token gerente é consumido **UMA VEZ**  
✓ Session var `gerente_token_validado` é **validado em trigger**

**Verificação**:
```sql
SELECT COUNT(*) FROM itens_venda iv
WHERE iv.desconto_percentual > 15
  AND iv.tipo_preco != 'ATACADO'
  AND NOT EXISTS (
    SELECT 1 FROM vendas v
    WHERE v.id = iv.venda_id AND v.gerente_token IS NOT NULL
  );
-- Resultado: 0
```

### C4: Mesmo Preço Online vs Offline
✓ `calcularPrecoCanonico()` = `calcular_preco_produto()` RPC  
✓ Offline recebe mesmos dados (tiers, promoções, config) que online  
✓ Sync não rejeita por "preço diferente"

**Verificação**:
```typescript
// E2E test que roda continuamente
const prodWeb = await webRPC(prodId, qty);
const prodLocal = offlineCalc(prodId, qty, offlineData);
assert(prodWeb.preco === prodLocal.preco);
```

### C5: O Preço Nunca Depende da Interface
✓ Nem React, nem Store, nem Hook, nem componente  
✓ Somente o motor canônico de cálculo  
✓ Nenhuma "ajuste de preço" no frontend (exceto apresentação)

**Verificação**:
```typescript
// Procurar em TODA codebase:
// Não deve existir:
// - item.preco *= (1 - desconto) [fora do RPC]
// - Math.round() no preço [use RPC]
// - Lógica ternária de preço [use RPC]

// Deve existir APENAS em:
// - calcularPrecoCanonico() (offline equivalence)
// - calcular_preco_produto() (RPC)
```

### C6: Cálculo de Preço é Determinístico
✓ Mesmos parâmetros sempre produzem mesmo resultado  
✓ Mesmo no Backend, PDV Web, PDV Local  
✓ Mesmo em horários diferentes (dentro de período de promo)

**Verificação**:
```typescript
// Teste: Chamar 100x com mesmos params
for (let i = 0; i < 100; i++) {
  const preco1 = await rpc.calcular_preco_produto(prodId, qty, lojaId);
  const preco2 = calcularPrecoCanonico(prodId, qty, offlineData);
  assert(preco1 === preco2, `Iteração ${i}: divergência`);
}
```

## OPERACIONAIS (Qualidade do Negócio)

### O1: Nunca Existir Duas Promoções Simultâneas no Mesmo Produto
✓ Máximo 1 promoção ativa por produto em qualquer período  
✓ Períodos (data_inicio, data_fim) nunca se sobrepõem  
✓ `ativa=false` previne colisões

**Verificação**:
```sql
SELECT produto_id, COUNT(*) FROM regras_preco
WHERE tipo = 'PROMOCAO' 
  AND ativa = true
  AND NOW() BETWEEN data_inicio AND data_fim
GROUP BY produto_id
HAVING COUNT(*) > 1;
-- Resultado: 0 linhas
```

### O2: Um Preço Final por Produto (Determinístico)
✓ Mesma entrada = sempre mesmo preço  
✓ Nenhuma ambiguidade ("qual desconto?")  
✓ Ordenação exata: Promo > Tier > Catalog > Varejo

**Verificação**:
```sql
SELECT COUNT(*) FROM (
  SELECT COUNT(*) cnt FROM calcular_preco_produto(...)
  GROUP BY produto_id
  HAVING COUNT(*) > 1
);
-- Resultado: 0
```

### O3: Motivo de Desconto é Sempre Especificado
✓ `motivo_desconto` nunca = NULL  
✓ Se = 'OUTROS', `motivo_descricao_livre` nunca = NULL/vazio  
✓ BI consegue agrupar por motivo (ENUM)

**Verificação**:
```sql
SELECT COUNT(*) FROM descontos_venda
WHERE motivo_desconto IS NULL
   OR (motivo_desconto = 'OUTROS' AND motivo_descricao_livre IS NULL);
-- Resultado: 0
```

### O4: Desconto Nunca Produz Preço Negativo
✓ `preco_final > 0` sempre  
✓ Desconto nunca > preço original  
✓ Carrinho `total_liquido >= 0`

**Verificação**:
```sql
SELECT COUNT(*) FROM itens_venda
WHERE preco_unitario <= 0 OR preco_unitario IS NULL
   OR total_desconto > preco_original;
-- Resultado: 0
```

## AUDITORIA (Rastreabilidade)

### A1: Todos os Descontos Auditados
✓ Cada `descontos_venda` tem:
  - `gerente_id` (quem autorizou)
  - `operador_id` (quem aplicou)
  - `motivo_desconto` + `motivo_descricao_livre` (por quê)
  - `aplicado_em` timestamp (quando)

**Verificação**:
```sql
SELECT COUNT(*) FROM descontos_venda
WHERE gerente_id IS NULL OR operador_id IS NULL 
   OR motivo_desconto IS NULL OR aplicado_em IS NULL;
-- Resultado: 0
```

### A2: Todos os Overrides de Margem Registrados
✓ Se vender abaixo custo, campo `autorizacao_margem_negativa` é NOT NULL  
✓ Contém: quem autorizou, motivo, timestamp  
✓ Relatório de overrides sempre disponível

**Verificação**:
```sql
SELECT COUNT(*) FROM itens_venda
WHERE preco_unitario < (SELECT preco_custo FROM produtos WHERE id = produto_id)
  AND autorizacao_margem_negativa IS NULL;
-- Resultado: 0
```

## FISCAL (Compliance)

### F1: NFC-e Recebe Dados Consistentes
✓ Preço final em NFC-e = `preco_unitario` no DB  
✓ Desconto em NFC-e = registrado em `descontos_venda`  
✓ Nenhuma divergência (rounding ou valor)

**Verificação**:
```sql
SELECT COUNT(*) FROM vendas v
WHERE v.total_liquido_nfe != 
  (SELECT SUM(preco_unitario * quantidade) FROM itens_venda WHERE venda_id = v.id);
-- Resultado: 0
```

### F2: Precedência de Preço é Respeitada Fiscalmente
✓ Promo é PRÉ-aplicada (no preco_unitario)  
✓ Desconto gerente é SEPARADO (em descontos_venda)  
✓ NFC-e mostra ambos, ordem correta

**Verificação**:
```
Cenário: Promo 30% + Desconto Item 5% + Desconto Gerente 10%
Esperado NFC-e:
  Preço original: 100
  Preço item (com promo): 70
  Desconto item: 3.50
  Preço item final: 66.50
  (depois, desconto gerente sobre total)
```

---

# CONTRATO DE CÁLCULO DE PREÇO

```
╔═══════════════════════════════════════════════════════════════╗
║  CONTRATO ARQUITETURAL - CÁLCULO DE PREÇO                    ║
║  (Single Source of Truth)                                     ║
╚═══════════════════════════════════════════════════════════════╝

ENTRADA
  p_produto_id (UUID)
  p_quantidade (INTEGER)
  p_loja_id (UUID)

PROCESSAMENTO (sequência exata, imutável)
  ↓
  PASSO 1: Promoção Ativa
    IF regras_preco.tipo='PROMOCAO' 
       AND ativa=true 
       AND data_inicio <= NOW() <= data_fim
    THEN return preco (desconto aplicado)
    ELSE continue
  
  ↓
  PASSO 2: Tier (Atacado)
    IF precos_atacado.quantidade_minima <= p_quantidade
    THEN return preco_unitario
    ELSE continue
  
  ↓
  PASSO 3: Catálogo Atacado
    IF p_quantidade >= pdv_config.quantidade_minima_atacado_padrao
    THEN return preco_atacado
    ELSE continue
  
  ↓
  PASSO 4: Varejo (Fallback)
    return preco_varejo

SAÍDA
  preco (NUMERIC)
  tipo ('PROMOCAO' | 'ATACADO' | 'VAREJO')
  fonte ('promocao' | 'tier' | 'catalogo' | 'varejo')
  regra_id (UUID or NULL)

PROPRIEDADES
  ✓ Determinístico (mesma entrada = sempre mesmo resultado)
  ✓ Exato (sem ambiguidade)
  ✓ Ordenado (nenhuma mudança de precedência)
  ✓ Auditável (rastreável até a fonte)

RESTRIÇÃO ARQUITETURAL
  Nenhum componente React, Store, ou Adapter pode alterar
  esta sequência. Toda mudança é discussão arquitetural
  (não implementação).

EVOLUÇÃO FUTURA
  Se precisa mudar: ALTER FUNCTION, never CREATE new RPC.
  Discussão: RFC no repositório antes de implementar.

╚═══════════════════════════════════════════════════════════════╝
```

---

# MATRIZ DE COMPATIBILIDADE

**Quando alguém implementa nova feature relacionada a desconto/pricing**, usar esta matriz para identificar impactos.

| Alteração Futura | Precisa Revisar | Impacto | Responsável |
|---|---|---|---|
| **Nova promoção (tipo/período)** | RPC 250 + offline + E2E | Médio | Backend |
| **Novo tipo de desconto** | RPC + State Machine + Auditoria | Alto | Backend + PDV |
| **Novo perfil/permissão** | RBAC + Tokens + Limits | Médio | Backend |
| **Nova fonte de PDV** | Pricing RPC + offline calc + sync | Alto | Frontend |
| **Integração com ERP externo** | Sync + Fiscal + Preço | Alto | Plataforma |
| **Mudança de rounding** | RPC + Fiscal + NFC-e | 🔴 Crítico | Fiscal + Backend |
| **Nova regra de margem** | Guards + Override + Audit | Médio | Backend |
| **Múltiplas moedas** | RPC + Precision + Fiscal | Alto | Fiscal |
| **Bundle/kit de produtos** | Pricing logic + Tiers + Promo | Alto | Backend |
| **Desconto por volume** | Tiers + Promoção + Tier override | Médio | Backend |
| **Acúmulo de descontos** | 🚫 REJEITAR | 🚫 Arquitetura | — |
| **Múltiplas promoções simultâneas** | 🚫 REJEITAR | 🚫 Política | — |

---

## Observações sobre Responsabilidades

**Backend**: Alterações em RPC, migrations, servidor  
**PDV**: Alterações em React, Store, validação frontend  
**Plataforma**: Alterações em sync, offline, reconciliação  
**Fiscal**: Alterações em rounding, NFC-e, impostos

**Crítico (🔴)**: Requer discussão executiva antes de implementar  
**Rejeitar (🚫)**: Viola contrato arquitetural, discussão vetada

---

# CONGELAMENTO ARQUITETURAL

## Decisão Final: Arquitetura Aprovada para Implementação

A partir de **2025-07-24**, a arquitetura de descontos do FastProduct é **CONGELADA** para implementação.

### O Que Está Congelado

✅ **Política Oficial de Acúmulo** — NÃO acumula preços (Promo XOR Tier XOR Atacado)  
✅ **Separação de Domínios** — Pipeline A (Preço) | Pipeline B (Comercial)  
✅ **Invariantes Críticos** — C1-C6 são invioláveis  
✅ **Contrato de Preço** — Sequência exata, imutável  
✅ **SSOT** — Uma única RPC de preço (`calcular_preco_produto`), nunca duplicada  
✅ **Precedência** — Promo → Tier → Catalog → Varejo (ordem final)  
✅ **Matriz de Compatibilidade** — Roadmap de futuras evoluções  

### O Que NÃO Muda Mais

❌ Nenhuma discussão arquitetural sobre formação de preço  
❌ Nenhuma proposta de acúmulo de preços  
❌ Nenhuma criação de RPCs duplicadas  
❌ Nenhuma mudança na precedência  
❌ Nenhuma alteração de invariantes sem RFC  

### Próxima Fase: Implementação Pura

**Objetivo**: Executar os 3 Minimum Viable Fixes com segurança.

**Proibido**: 
- Refatorações arquiteturais
- Discussões de design alternativo
- Mudanças de estrutura

**Permitido**:
- Implementar exatamente conforme aprovado
- Corrigir bugs de implementação
- Adicionar testes
- Documentar código

**Timeline**:
- Dias 1-2: Implementação paralela (3 devs)
- Dia 3: Merge + E2E tests
- Dia 4: QA manual + Regressions
- Dia 5: Re-auditoria → Bloqueadores resolvidos ✓

### Revisão Arquitetural Futura

Quando (não se) precisar evoluir o sistema:

1. Criar RFC com justificativa de negócio
2. Revisar contra Invariantes (especialmente C1-C4)
3. Revisar contra Contrato de Preço
4. Revisar contra Matriz de Compatibilidade
5. Votação técnica (Backend, Frontend, Fiscal, Plataforma)
6. Apenas APÓS aprovação: começar implementação

**Alterações que automaticamente REJEITAM RFC**:
- Acúmulo de preços (viola C1)
- Criação de RPC duplicada (viola SSOT)
- Mudança de precedência (viola contrato)
- Bypass de invariantes críticos (C1-C6)

---

# SUMÁRIO EXECUTIVO: 3 MVFs

| Blocker | MVF | Arquivos | Hours | SSOT | Rollback |
|---------|-----|----------|-------|------|----------|
| #1 | Validação frontend | 1 | 4h | ✅ | Trivial |
| #2 | ENUM motivo | 3 | 7h | ✅ | Trivial |
| #3 | Estender RPC 250 | 3 | 7.5h | ✅ | Trivial |
| **TOTAL** | | **7** | **18.5h** | **✅ Preservado** | **Trivial** |

---

# IMPLEMENTAÇÃO PARALELA (5 DIAS)

```
DIA 1-2: 3 devs em paralelo (MVF #1 + #2 + #3)
         (4h + 7h + 7.5h) ÷ 2 devs ≈ 9h/dev

DIA 3:   Merge + E2E tests (4h)

DIA 4:   QA manual + Regressions (8h)

DIA 5:   Re-auditoria (4h) → Go-Live aprovado ✓
```

---

# CHECKLIST DE APROVAÇÃO

Para Go-Live, verificar:

- [ ] MVF #1 implementado + E2E test passando
- [ ] MVF #2 implementado + UI 3-step funcionando + motivo registrado
- [ ] MVF #3 implementado + RPC 250 estendida (não nova RPC)
- [ ] Invariantes C1-C4 verificadas (SSOT, permissão, online/offline, custo)
- [ ] Precedência de preço documentada e testada
- [ ] Contrato de Cálculo validado em código
- [ ] 100% E2E tests passando em CI
- [ ] Fiscal (NFC-e) validado (rounding, valores)
- [ ] Rollback procedure documentado

---

**Documento Canônico**  
Versão: 2.0  
Data: 2025-07-24  
Status: ✅ Pronto para Implementação

