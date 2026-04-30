# Conflito de Estoque: Vendas Offline Simultâneas

## 🎯 **Pergunta: Se duas máquinas vendem o último item offline ao mesmo tempo, quem ganha?**

## 📋 **Resposta Direta**

**A primeira que conseguir o `FOR UPDATE` no banco ganha. A segunda recebe erro de estoque insuficiente.**

---

## 🔍 **Análise do Cenário**

### **Cenário Típico**
```
Máquina A: Produto X (estoque: 1) → Vender offline
Máquina B: Produto X (estoque: 1) → Vender offline
Rede: Instável/Indisponível
Banco: Supabase (PostgreSQL)
```

### **Fluxo de Conflito**
```
1. Ambas as máquinas vendem offline (sem sincronia)
2. Quando a rede voltar, ambas tentam sincronizar
3. A primeira que conseguir lock do estoque vence
4. A segunda recebe erro e precisa tratar o conflito
```

## 🏛️ **Estratégia de Resolução: FOR UPDATE**

### **Como Funciona o FOR UPDATE**
```sql
-- Na RPC finalizar_venda_transacional_canonica_v3
SELECT quantidade_atual INTO v_estoque_atual
FROM estoque 
WHERE produto_id = v_produto_id 
AND loja_id = p_loja_id
FOR UPDATE;  -- 🔒 BLOQUEIA A LINHA ATÉ FIM DA TRANSAÇÃO
```

### **Comportamento em Concorrência**
```sql
-- Máquina A (primeira)
BEGIN;
SELECT quantidade_atual FROM estoque WHERE produto_id = 'X' FOR UPDATE;
-- ✅ SUCESSO: Linha bloqueada para Máquina A
UPDATE estoque SET quantidade_atual = 0 WHERE produto_id = 'X';
COMMIT;

-- Máquina B (segunda)  
BEGIN;
SELECT quantidade_atual FROM estoque WHERE produto_id = 'X' FOR UPDATE;
-- ⏳ ESPERA: Aguardando liberação do lock
-- Quando Máquina A der COMMIT:
-- ❌ FALHA: quantidade_atual = 0 (validação falha)
ROLLBACK;
```

## 📊 **Quem Ganha?**

### **Regra: First-Come-First-Served com Validação**
1. **Lock Obtido**: Primeira máquina a conseguir `FOR UPDATE`
2. **Validação Real**: Verifica se estoque ainda disponível
3. **Transação Atômica**: Tudo ou nada
4. **Rollback Automático**: Se falhar, tudo revertido

### **Resultado Esperado**
```
Máquina A: ✅ Venda sincronizada com sucesso
Máquina B: ❌ Erro "Estoque insuficiente para produto X"
```

## 🔄 **Fluxo Completo de Conflito**

### **Fase 1: Offline**
```
Máquina A: Vende Produto X (offline)
Máquina B: Vende Produto X (offline)
Estoque local: Ambas com "1 disponível"
```

### **Fase 2: Sincronização**
```
Máquina A: Tenta sincronizar → FOR UPDATE → SUCESSO
Máquina B: Tenta sincronizar → FOR UPDATE → ESPERA → FALHA
```

### **Fase 3: Resolução**
```
Máquina A: ✅ Venda confirmada, estoque = 0
Máquina B: ❌ Erro, precisa tratar conflito
```

## 🛠️ **Tratamento do Conflito**

### **Para a Máquina Perdedora**
```typescript
// No frontend da Máquina B
const resultado = await finalizarVendaCaixaImpl(input)

if (!resultado.ok) {
  if (resultado.error.includes('Estoque insuficiente')) {
    // 🔄 TRATAMENTO DO CONFLITO
    await handleEstoqueConflito({
      produtoId: 'X',
      motivo: 'Venda simultânea detectada',
      acao: 'notificar_operador'
    })
    
    // Opções:
    // 1. Notificar operador
    // 2. Cancelar venda local
    // 3. Marcar como pendente de resolução
  }
}
```

### **Estratégias de Mitigação**
```typescript
async function handleEstoqueConflito(config: {
  produtoId: string
  motivo: string
  acao: 'notificar' | 'cancelar' | 'pendente'
}) {
  switch (config.acao) {
    case 'notificar':
      // Notificar operador sobre conflito
      showToast({
        type: 'warning',
        title: 'Conflito de Estoque',
        message: `Produto ${config.produtoId} vendido simultaneamente em outra máquina.`
      })
      break
      
    case 'cancelar':
      // Cancelar venda local
      await cancelarVendaLocal(vendaId)
      break
      
    case 'pendente':
      // Marcar como pendente de resolução manual
      await marcarVendaPendente(vendaId, config.motivo)
      break
  }
}
```

## 🎯 **Estratégias Avançadas**

### **1. Optimistic Locking**
```sql
-- Adicionar versão ao estoque
ALTER TABLE estoque ADD COLUMN versao INTEGER DEFAULT 0;

-- Update com verificação de versão
UPDATE estoque 
SET quantidade_atual = quantidade_atual - 1,
    versao = versao + 1
WHERE produto_id = 'X' 
AND versao = p_versao_esperada;
```

### **2. Queue-Based Resolution**
```typescript
// Fila de sincronização para resolver conflitos
const syncQueue = new Queue({
  concurrency: 1, // Processa um por vez
  retry: 3
})

// Todas as vendas offline passam pela fila
await syncQueue.add(() => sincronizarVenda(venda))
```

### **3. Timestamp-Based Resolution**
```sql
-- Venda com timestamp mais antiga ganha
CREATE OR REPLACE FUNCTION resolver_conflito_vendas(
  p_venda_a UUID, p_venda_b UUID
) RETURNS UUID AS $$
BEGIN
  -- Retorna a venda com timestamp mais antigo
  RETURN (
    SELECT id FROM vendas 
    WHERE id IN (p_venda_a, p_venda_b)
    ORDER BY data_venda ASC 
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;
```

## 📱 **Experiência do Operador**

### **Cenário Ideal**
```
Operador A: "Venda realizada com sucesso" ✅
Operador B: "Atenção: Conflito detectado. Produto vendido em outra máquina." ⚠️
```

### **Recuperação**
```
Operador B: 
1. Notificado sobre conflito
2. Venda local cancelada automaticamente
3. Estoque atualizado
4. Pode continuar vendendo outros produtos
```

## 🔧 **Implementação Prática**

### **RPC com Tratamento de Conflito**
```sql
CREATE OR REPLACE FUNCTION finalizar_venda_com_conflito(
  p_venda_id UUID,
  -- ... outros parâmetros
  p_conflito_strategy TEXT DEFAULT 'FIRST_WINS' -- FIRST_WINS | TIMESTAMP | MANUAL
) RETURNS TABLE(
  venda_id UUID,
  status TEXT,
  mensagem TEXT,
  conflito_detectado BOOLEAN,
  vencedor_conflito UUID
) AS $$
BEGIN
  -- Tentar lock do estoque
  BEGIN
    SELECT quantidade_atual INTO v_estoque_atual
    FROM estoque 
    WHERE produto_id = v_produto_id 
    AND loja_id = p_loja_id
    FOR UPDATE NOWAIT;  -- Não espera, falha imediatamente
  EXCEPTION
    WHEN lock_not_available THEN
      -- Lock não disponível, detectar conflito
      RETURN QUERY SELECT 
        NULL::UUID,
        'CONFLITO_DETECADO'::TEXT,
        'Conflito de concorrência detectado. Resolvendo...'::TEXT,
        true::BOOLEAN,
        NULL::UUID;
      RETURN;
  END;
  
  -- Continuar com fluxo normal...
END;
$$ LANGUAGE plpgsql;
```

## 📊 **Métricas de Conflito**

### **Monitoring**
```typescript
// Métricas para detectar padrões de conflito
interface ConflitoMetrics {
  totalConflitos: number
  produtosComMaisConflitos: Array<{
    produtoId: string
    conflitos: number
  }>
  maquinasComMaisConflitos: Array<{
    deviceId: string
    conflitos: number
  }>
  horariosDePico: Array<{
    hora: number
    conflitos: number
  }>
}
```

### **Alertas**
```typescript
// Se taxa de conflitos > 5%, alertar
if (conflitosRate > 0.05) {
  await alertarAdministrador({
    type: 'CONFLITOS_ESTOQUE',
    message: `Taxa de conflitos: ${(conflitosRate * 100).toFixed(1)}%`,
    action: 'review_estoque_strategy'
  })
}
```

---

## 🏆 **Resposta Final**

**Quem ganha? A primeira máquina que conseguir o lock `FOR UPDATE` no banco de dados.**

**E a perdedora?** Recebe erro de estoque insuficiente e precisa tratar o conflito de forma graceful, notificando o operador e cancelando a venda local.

**Estratégia implementada:** First-come-first-served com validação atômica e tratamento robusto de conflitos.

O sistema garante **consistência total** - nunca haverá vendas duplicadas ou estoque negativo, mesmo em cenários de alta concorrência offline.
