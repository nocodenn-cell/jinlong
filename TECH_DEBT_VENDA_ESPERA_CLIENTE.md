# 📋 Débito Técnico: Venda em Espera sem Cliente Persistido

**ID**: DEBT-VENDA-ESPERA-CLIENTE  
**Status**: 📅 Planejado Fase 7  
**Severidade**: 🟡 Média (impacto operacional, não crítico)  
**Data Identificação**: 2026-07-11  
**Auditoria**: [AUDITORIA_CLIENTE_ID_VENDAS_EM_ESPERA.md](./AUDITORIA_CLIENTE_ID_VENDAS_EM_ESPERA.md)

---

## 🎯 Resumo

Quando um operador coloca uma venda em espera com **intenção de cliente futuro**, a aplicação não permite associar o cliente naquele momento. Resultado: venda é salva como **anônima** e o operador precisa refazer a associação manualmente ao retomar.

---

## 🔴 Problema

### Cenário
1. Operador monta carrinho
2. Cliente informa CPF/nome para nota fiscal
3. Operador quer guardar a venda em espera COM o cliente associado
4. **Hoje**: Deve escolher entre perder o cliente ou não colocar em espera
5. **Resultado**: Débito técnico de retrabalho

### Dados Técnicos
- **Campo**: `vendas_em_espera.cliente_id` (nullable uuid)
- **RPC**: `colocar_venda_em_espera(p_cliente_id uuid DEFAULT NULL, ...)`
- **Atual**: Sempre `p_cliente_id = null` (hardcoded)
- **Origem**: Sem UI para captura de cliente

---

## 📊 Impacto

### Operacional
- ❌ Fluxo interrompido para buscar cliente depois
- ❌ Risco de perda de informação cliente durante espera
- ❌ Duplicação de manual: guardar cliente externamente + re-digitar

### Técnico
- ⚠️ Coluna `cliente_id` na tabela não é utilizada
- ⚠️ RPC suporta parâmetro, TypeScript não transmite
- ⚠️ Tipo `RetomarEmEsperaResult` não inclui `cliente_id` retomado

### Financeiro
- 🕐 Retrabalho ~30-60 segundos por venda em espera com cliente
- 📈 Multiplicado por frequência de vendas em espera

---

## 🏗️ Arquitetura Impactada

### 1. Backend (RPC)
- ✓ `colocar_venda_em_espera()` aceita `p_cliente_id`
- ✓ `retomar_venda_em_espera()` retorna `cliente_id`
- ✗ `listar_vendas_em_espera()` não inclui `cliente_id` no JSON

**Arquivo**: `backend/supabase/migrations/247c_vendas_em_espera_e_consulta_rapida.sql`

### 2. TypeScript (Backend)
- ✗ `colocarVendaEmEsperaImpl()` não aceita `clienteId` no input
- ✗ `RetomarEmEsperaResult` não inclui `clienteId` no output
- ✗ `VendaEmEsperaCard` não inclui `clienteId`

**Arquivo**: `pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts`

### 3. TypeScript (Frontend)
- ✗ `CaixaPageClient.tsx` não tem estado para `clienteId`
- ✗ `colocarVendaEmEsperaCaixa()` action não aceita `clienteId`
- ✗ Nenhuma UI para seleção de cliente no fluxo de espera

**Arquivo**: `pdv-importados/app/caixa/CaixaPageClient.tsx`

### 4. Estado (Carrinho)
- ✗ `unifiedCartStore.ts` tipo `ItemCarrinho` não inclui `clienteId`
- ✗ Sem contexto global de cliente na sessão

**Arquivo**: `pdv-importados/stores/unifiedCartStore.ts`

### 5. Componente Cliente
- ❌ Não existe interface de seleção/busca de cliente no PDV
- 📅 Planejado para Fase 7

**Arquivo**: (não existe / TODO)

---

## 📝 Matriz de Conformidade Atual

| Componente | Suporta? | Notas |
|-----------|----------|-------|
| RPC `colocar_venda_em_espera` | ✓ Sim | Parâmetro aceito, sempre null passado |
| RPC `retomar_venda_em_espera` | ✓ Sim | Retorna cliente_id, TypeScript descarta |
| RPC `listar_vendas_em_espera` | ✗ Não | Não inclui no JSON retornado |
| TypeScript `colocarVendaEmEsperaImpl` | ✗ Não | Não aceita clienteId no input |
| TypeScript `RetomarEmEsperaResult` | ✗ Não | Não inclui no type de saída |
| Frontend: Captura Cliente | ✗ Não | Sem UI, sem estado |
| Frontend: Exibição na Lista | ✗ Não | VendaEmEsperaCard não inclui cliente |
| Frontend: Restauração | ✗ Não | handleRetomarEmEspera não processa |
| Estado Global | ✗ Não | Sem contexto de cliente no carrinho |

---

## 🔧 Solução Planejada (Fase 7)

### Implementação Completa

#### 1. UI de Captura (CaixaPageClient.tsx)
```typescript
// Novo estado
const [clienteId, setClienteId] = useState<string | null>(null)
const [nomeCliente, setNomeCliente] = useState<string>("")

// Nova aba no PDV
<CaixaPdvClienteTab
  clienteId={clienteId}
  nomeCliente={nomeCliente}
  onSelectCliente={(id, nome) => {
    setClienteId(id)
    setNomeCliente(nome)
  }}
/>
```

#### 2. Passagem para RPC
```typescript
const res = await colocarVendaEmEsperaCaixa({
  itens,
  totalBruto,
  totalDesconto,
  totalLiquido: totalLiquidoComGerente,
  caixaId,
  clienteId,  // ← NOVO
  descontoGerentePercentual,
})
```

#### 3. Atualização de Types
```typescript
// caixaVendaEspera.impl.ts
export type ColocarEmEsperaInput = {
  // ...
  clienteId?: string | null  // ← NOVO
}

export type RetomarEmEsperaResult = {
  ok: true
  id: string
  numeroLocal: number
  itens: ItemCarrinho[]
  clienteId?: string | null  // ← NOVO
  nomeCliente?: string | null  // ← NOVO
}

export type VendaEmEsperaCard = {
  // ...
  clienteId?: string | null  // ← NOVO
  nomeCliente?: string | null  // ← NOVO
}
```

#### 4. Restauração no Frontend
```typescript
const handleRetomarEmEspera = async (id: string) => {
  const res = await retomarVendaEmEsperaCaixa(id)
  if (!res.ok) return
  
  // Restaurar cliente
  if (res.clienteId) {
    setClienteId(res.clienteId)
    setNomeCliente(res.nomeCliente ?? "")
  }
  
  // Restaurar itens
  substituirCarrinho(res.itens)
}
```

#### 5. Atualizar RPC `listar_vendas_em_espera()`
```sql
SELECT jsonb_agg(
  jsonb_build_object(
    -- ... campos existentes
    'cliente_id', v.cliente_id,
    'nome_cliente', c.nome  -- join com clientes
  )
)
FROM public.vendas_em_espera v
LEFT JOIN public.clientes c ON v.cliente_id = c.id
```

---

## ✅ Checklist de Implementação

- [ ] Criar componente `CaixaClienteSeletor` (busca + seleção)
- [ ] Adicionar aba "Cliente" ao `CaixaPdvOperadorTabs`
- [ ] Adicionar estado `clienteId` em `CaixaPageClient`
- [ ] Atualizar `colocarVendaEmEsperaCaixa()` action
- [ ] Atualizar `colocarVendaEmEsperaImpl()` para aceitar `clienteId`
- [ ] Atualizar `RetomarEmEsperaResult` type
- [ ] Atualizar `VendaEmEsperaCard` type
- [ ] Atualizar RPC `listar_vendas_em_espera()` com JOIN clientes
- [ ] Atualizar `handleRetomarEmEspera()` para restaurar cliente
- [ ] Exibir cliente na `CaixaEmAbertoList`
- [ ] Testes E2E: capturar cliente + colocar espera + retomar
- [ ] Testes E2E: listar com cliente exibido
- [ ] Documentação: fluxo completo de cliente

---

## 🚫 Riscos de Não Implementar

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Retrabalho operacional | 🟡 Média | Documentar workaround (guardar cliente externamente) |
| Abandono de dados | 🔴 Alta | Fase 7 precisa ser priorizada |
| Débito técnico crescente | 🟡 Média | Revisar a cada sprint se faz sentido postergar |

---

## 📅 Fase de Resolução

**Fase 7 — Gestão de Clientes Completa**

### Escopo Fase 7
- [ ] CRUD de clientes (criar, buscar, editar)
- [ ] Integração com vendas: **venda em espera com cliente** ← Este débito
- [ ] Integração com vendas: venda finalizada com cliente
- [ ] Relatório: cliente + histórico de compras
- [ ] CPF/CNPJ para NF eletrônica

### Dependências
- UI de seleção de cliente (prerequisito)
- Tabela `clientes` consolidada
- RLS para clientes por loja

---

## 📎 Referências

- **Migration**: `backend/supabase/migrations/247c_vendas_em_espera_e_consulta_rapida.sql`
- **Tipos**: `pdv-importados/app/caixa/server/caixaVendaEspera.impl.ts`
- **Frontend**: `pdv-importados/app/caixa/CaixaPageClient.tsx`
- **UI Listagem**: `pdv-importados/app/caixa/CaixaEmAbertoList.tsx`
- **TODO no código**: Linha 317, caixaVendaEspera.impl.ts: `// TODO(fase-7): vendas.cliente_id → join clientes`

---

## 💬 Notas

- Campo é **opcional** (nullable) — sistema funciona sem cliente
- RPC já suporta — apenas TypeScript/UI não conecta
- **Não é bloqueador** para Fase 6 (venda em espera sem cliente)
- Prioridade: Média (impacto operacional real, mas workaround possível)

---

**Documento gerado**: 2026-07-11  
**Auditoria**: Completa, sem assumir que estava correto
