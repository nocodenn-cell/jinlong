# ONDA 2 — ATACADO RUNTIME: INVESTIGAÇÃO COMPLETA

**Data:** 2026-08-31  
**Branch:** claude/fastproduct-atacado-wave-2-cf14cd (worktree)  
**SHA main:** 55af79ac  
**Escopo:** IDs 32, 33, 36, 40, 44, 50, 51

---

## 1. BASELINE

| Item | Valor |
|------|-------|
| Branch atual | claude/fastproduct-atacado-wave-2-cf14cd |
| origin/main SHA | 55af79acda04f7d5f55b5211945586f06504104b |
| Working tree | Clean |
| PRs ativas relevantes | Nenhuma (359 merged, 351-358 fechadas como superseded) |
| Bloqueadores P0 não resolvidos | 36 (E2E não validado) |

---

## 2. MATRIZ CANÔNICA DOS IDs (Onda 2)

| ID | Capacidade | Prioridade | Status Documentado | Status Real | Gap | Severidade |
|----|------------|------------|-------------------|------------|-----|-----------|
| 32 | Preço atacado runtime | P0 | IMPLEMENTADO PARCIALMENTE | ✓ FUNCIONAL | produtos.preco_atacado ignorado RPC (correto) | Baixa |
| 33 | Qtd mínima atacado | P0 | IMPLEMENTADO PARCIALMENTE | ✓ FUNCIONAL | Campos legacy confusos em UI | Baixa |
| 36 | Aplicação automática faixa | P0 | EXISTE MAS NÃO VALIDADO | ✓ IMPLEMENTADO | Sem E2E runtime atacado | **Alta** |
| 40 | Exibição faixa aplicada (UI) | P1 | IMPLEMENTADO PARCIALMENTE | ⚠️ PARCIAL | Não mostra threshold qty | Baixa |
| 44 | Validação conflitos | P1 | IMPLEMENTADO PARCIALMENTE | ⚠️ PARCIAL | Sem valid tier<varejo CRUD | Baixa |
| 50 | Auditoria sobrescrita | P1 | IMPLEMENTADO PARCIALMENTE | ⚠️ PARCIAL | Motivo override incompleto | Média |
| 51 | Histórico preços | P1 | IMPLEMENTADO PARCIALMENTE | ⚠️ PARCIAL | Tiers não historizados | Média |

---

## 3. DIAGRAMA DO RUNTIME (PDV → Banco → Recibo)

```
┌─────────────────────────────────────────────────────────────────┐
│ FLUXO COMPLETO DE PREÇO/ATACADO NA VENDA                        │
└─────────────────────────────────────────────────────────────────┘

A. SCAN INICIAL (Qty=1)
  └─ webCaixaScanProcess.ts:112
     └─ buscarProdutoComPrecoCaixa(codigo, 1) [Server Action]
        └─ caixaCatalogo.impl.ts: busca produto
        └─ caixaPrecoProduto.impl.ts: RPC calcular_preco_produto(p_id, 1, loja)
           └─ SQL calcular_preco_produto() migration 20260823192022
              └─ SELECT tier da precos_atacado WHERE qty_min ≤ 1
              └─ Resultado: QUASE SEMPRE VAREJO (qty 1 < qualquer min típico)
        └─ Retorna: preco + tipo (VAREJO/ATACADO) + regraId
     └─ montarItemCarrinhoCaixa: cria item com preço authoritative
     └─ adicionarItem ao carrinho

B. ESCANEIA NOVAMENTE MESMO CÓDIGO (500ms dedupe)
  └─ CaixaPageClient.tsx:568
     └─ alterarQuantidade(itemId, qty+1) [UI otimista]
     └─ reprecificar(itemId, produtoId, qty+1) [SEM debounce]
        └─ useReprecificarQuantidadeCaixa.ts:68
           └─ calcularPrecoProdutoCaixa({ produtoId, qty+1 }) [IMEDIATA]
              └─ RPC calcular_preco_produto(p_id, qty+1, loja)
                 └─ Se qty+1 ≥ tier_min: ATACADO + regraId
                 └─ Else: VAREJO
           └─ sincronizarPrecoCalculadoRpc(itemId, {preço, tipo})
                └─ Atualiza carrinho em tempo real

C. ALTERA QUANTIDADE MANUALMENTE (campo de qty)
  └─ CaixaPageClient.tsx:613
     └─ alterarQuantidade(itemId, qtyNova) [UI otimista]
     └─ reprecificar(itemId, produtoId, qtyNova, debounce=true)
        └─ useReprecificarQuantidadeCaixa.ts:72 [debounce 350ms]
           └─ Após 350ms sem digitação:
              └─ RPC calcular_preco_produto(p_id, qtyNova, loja)
                 └─ Retorna preço atualizado se faixa mudou

D. RETOMA VENDA EM ESPERA
  └─ useCaixaVendasEmEspera.ts:182
     └─ retomarVendaEmEsperaCaixa(id) [Server Action]
        └─ RPC retomar_venda_em_espera(id, operador)
           └─ Restaura snapshot (itens + qtys + cliente)
     └─ Para cada item no snapshot (linhas 203-211):
        └─ reprecificar(itemId, produtoId, quantidade, tipo)
           └─ RPC calcular_preco_produto(p_id, quantidade, loja)
              └─ Recalcula se tiers mudaram desde que colocou em espera

E. FINALIZA VENDA
  └─ CaixaPageClient.tsx finalizarVendaAction
     └─ finalizarVendaCaixa.ts [Server Action]
        └─ RPC finalizar_venda v4 (com revalidação de preços)
           └─ Revalida cada item: quantidade + tier no commit
           └─ Rejeita se preço mudou (operador colocou qty ≥ 1000 manual)
           └─ Commit: cria vendas + itens_venda
              └─ itens_venda.tipo_preco (VAREJO/ATACADO/MANUAL)
              └─ itens_venda.preco_unitario_original (capturado)
              └─ itens_venda.regra_id (da tier)

F. RECIBO/HISTÓRICO
  └─ caixaHistoricoRecibo.ts
     └─ historicoDetalheParaRecibo(vendaId)
        └─ Lê itens_venda.tipo_preco + regra_id
        └─ Exibe "Atacado" badge com faixa aplicada (ID 40)
        └─ Recalcula total com preços originais (F12 reimpressão)
```

---

## 4. CÓDIGO AUTORITATIVO (Ponto Único de Verdade)

### A. RPC SQL (migration 20260823192022)
**Arquivo:** `backend/supabase/migrations/20260823192022_d0_pricing_tiers_ssot.sql`  
**Função:** `calcular_preco_produto(p_produto_id, p_quantidade, p_loja_id)`

**Lógica:**
```sql
1. Valida p_quantidade >= 1
2. Busca preco_varejo de produtos WHERE id = p_produto_id AND ativo = true
3. Se não encontrou produto: erro 'produto_nao_encontrado'
4. Busca tier aplicável:
   SELECT preco_unitario, id FROM precos_atacado
   WHERE produto_id = p_produto_id
     AND ativo = true
     AND quantidade_minima <= p_quantidade
     AND (loja_id IS NULL OR loja_id = p_loja_id)
   ORDER BY quantidade_minima DESC
   LIMIT 1
5. Se tier encontrado: retorna {preco, tipo:'ATACADO', regraId}
6. Else: retorna {preco: varejo, tipo:'VAREJO'}
```

**Nota:** Ignora completamente `produtos.preco_atacado` e `pdv_config.quantidade_minima_atacado_padrao` (legado).

### B. TS (shared-core)
**Arquivo:** `shared-core/src/pricing/calcularPrecoCanonico.ts`  
**Função:** `calcularPrecoCanonico(input: CalcularPrecoCanonicoInput)`

**Paridade:** Bit-a-bit equivalent da RPC (linha 2-3 do arquivo).

**Diferenças intencionais:**
- TypeScript trabalha com tiers array (web + offline)
- SQL busca do banco em tempo real (web)
- Ambos usam mesma regra: maior quantity_minima ≤ quantidade

### C. Integração Web
**Arquivo:** `pdv-importados/app/caixa/server/caixaPrecoProduto.impl.ts`  
**Função:** `calcularPrecoProdutoCaixaImpl`

1. Autenticação via `getUsuarioAtual()`
2. Converte quantidade para RPC (floor)
3. Chama RPC via Supabase client
4. Retorna resultado estruturado ou erro i18n

---

## 5. DIAGNÓSTICO PROFUNDO DO ID 36 (Aplicação Automática)

### O QUE EXISTE (evidência do código):

✓ **RPC implementada e ativa:** migration 20260823192022 está no schema  
✓ **TS porta equivalente:** calcularPrecoCanonico.ts com testes unitários  
✓ **Integração no PDV:** caixaPrecoProduto.impl.ts chama RPC  
✓ **Reprecificação ao alterar qty:** useReprecificarQuantidadeCaixa.ts com debounce  
✓ **Reprecificação ao escanear duplicado:** webCaixaScanProcess.ts linha 568  
✓ **Reprecificação ao retomar espera:** useCaixaVendasEmEspera.ts linha 203-211  
✓ **Persistência:** itens_venda.tipo_preco + regra_id gravados  
✓ **Revalidação no commit:** finalizar_venda v4 revalida preços  

### O QUE NÃO EXISTE (gap):

✗ **Teste E2E end-to-end validando o fluxo:** Nenhum teste Playwright que:
  - Scane item (qty=1) → valida VAREJO
  - Scane novamente (qty=2...9) → valida VAREJO
  - Scane até qty=10 → valida ATACADO 80 (se houver tier qty 10)
  - Verifica total da venda com preço atacado

✗ **Cenários não testados:**
  - Transição 9 → 10 (abaixo mín → iguala mín)
  - Múltiplas faixas (10, 50, 100) + transitions
  - Descontos aplicados + atacado
  - Venda em espera por dias (tiers atualizadas, recupera)
  - Produtos sem tiers (sempre varejo)
  - Tiers por loja vs global

### DIAGNÓSTICO FINAL DO ID 36:

| Aspecto | Resultado |
|---------|-----------|
| **Código existe** | ✓ SIM |
| **Lógica correcta** | ✓ SIM (testes unitários passam) |
| **Integração PDV** | ✓ SIM (reprecifica em 3 pontos) |
| **Persistência** | ✓ SIM (itens_venda.tipo_preco + regra_id) |
| **Revalidação backend** | ✓ SIM (finalizar_venda v4) |
| **E2E test coverage** | ✗ NÃO (gap crítico) |
| **Bloqueador P0** | ✓ CONFIRMADO (causa = falta validação operacional) |

**Conclusão:** O ID 36 **ESTÁ IMPLEMENTADO E FUNCIONA**, mas o documento "EXISTE MAS NÃO VALIDADO" é correto — falta teste que **prove** que o operador vê o comportamento correto na tela.

---

## 6. SSOT (Single Source of Truth) IDENTIFICADOS

### Preço Varejo
- **Fonte:** `produtos.preco_varejo`
- **Autoridade:** Backend RPC + RLS
- **Consumidor:** calcular_preco_produto (fallback se sem tier)
- **Status:** ✓ SSOT confirmada

### Faixas de Atacado
- **Fonte:** `precos_atacado` (tabela: produto_id, quantidade_minima, preco_unitario, ativo, loja_id)
- **Autoridade:** Backend RPC calcular_preco_produto (ORDER BY quantidade_minima DESC)
- **Consumidor:** Web (RPC) + Local (calcularPrecoCanonico TS array)
- **Validação:** UNIQUE (produto_id, quantidade_minima, loja_id, ativo) — evita duplicatas
- **Status:** ✓ SSOT confirmada

### Seleção da Faixa
- **Regra:** Maior quantity_minima ≤ p_quantidade (ORDER BY DESC LIMIT 1)
- **Paridade:** SQL ≡ TS (bit-a-bit)
- **Validação:** Unitários passam; E2E não existe
- **Status:** ✓ SSOT confirmada, ✗ validação operacional missing

### Preço Efetivo no Carrinho
- **Quando:** Após RPC calcular_preco_produto (reprecificar hook)
- **Armazenamento:** Zustand carrinhoStore (estado UI)
- **Persistência:** itens_venda.preco_unitario_original (no commit)
- **Revalidação:** finalizar_venda v4 revalida antes de commit
- **Status:** ✓ SSOT confirmada

### Validação Financeira Backend
- **Garantia:** Nenhum preço chega do frontend direto
- **Fluxo:** UI calcula → RPC valida → item_venda recalculado → commit
- **Proteção:** Se qty mudou, tier pode ter mudado, finalizar_venda rejeita
- **Status:** ✓ Segurança confirmada

---

## 7. DECISÕES DE NEGÓCIO PENDENTES

### Nenhuma identificada nesta Onda 2.

Todos os IDs têm regra clara ou conclusão definida. Abaixo, decisões já tomadas:

- ✓ Faixas por loja (não global + local, mas global + loja-specific)
- ✓ Maior quantity_minima vence (não % desconto, mas preço absoluto)
- ✓ Sem seleção manual varejo/atacado (automático por quantity, por design D0)
- ✓ Tiers não suportam 0 quantidade (verificado: CHECK quantity_minima >= 1)

---

## 8. PLANO MÍNIMO DE IMPLEMENTAÇÃO (Onda 2)

### Fase 1: Validação Operacional (ID 36)
**Objetivo:** Teste E2E comprovando o fluxo completo

**PR proposta:**
- **Título:** "test(e2e): validar aplicação automática de faixa atacado no runtime"
- **Objetivo único:** 1 teste E2E que scane produto até qty ≥ tier_min e valida preço
- **Arquivos:** `pdv-importados/e2e/caixa-atacado-varejo-runtime.spec.ts`
- **Cenários:**
  1. Scan inicial (qty=1) com tier mín=10 → VAREJO
  2. Scan 9 vezes mais (qty=10 total) → ATACADO com preço da tier
  3. Scan mais 40 vezes (qty=50 total, se tier mín=50 existe) → ATACADO mín 50
  4. Verificar total da venda = sum(item.preco * item.qty)
  5. Finalizar venda e validar itens_venda.tipo_preco + regra_id
- **Testes**: 4-6 casos (transições, múltiplas faixas, desconto 0)
- **Dependências:** Nenhuma (schema já existe)
- **Ordem merge:** 1ª (desbloqueia validação)
- **Risco:** Baixo (readonly, E2E only)

**Go/No-Go após este teste:**
- Se passar ✓: ID 36 → IMPLEMENTADO E VALIDADO; desbloqueia Onda 2 prosseguir
- Se falhar ✗: Descobrir bug no runtime; fixar antes de próximas PRs

### Fase 2: Gaps Secundários (IDs 32, 33, 40, 44, 50, 51)
**Após ID 36 validado, atacar em paralelo:**

#### PR 2a: ID 40 — Exibição faixa aplicada
- **Objetivo:** Mostrar `quantidade_gatilho` e `preco_atacado` da faixa no badge
- **Arquivo:** `pdv-importados/components/ui/PriceTooltip.tsx`, `CaixaCartList.tsx`
- **Mudança:** Passar `regraId` ao badge; buscar tier name + qty_min em dicionário
- **Risco:** Médio (UI, não lógica de preço)

#### PR 2b: ID 50 — Auditoria sobrescrita (motivo)
- **Objetivo:** Capturar motivo quando operador manualmente altera preço (MANUAL)
- **Arquivo:** `CaixaGerenteModal.tsx`, `finalizarVendaValidation.ts`, `itens_venda.motivo_override` (new col)
- **Migration:** Adicionar coluna motivo_override
- **Risco:** Alto (schema change, validação)

#### PR 2c: ID 51 — Histórico preços (tiers)
- **Objetivo:** Auditoria de quando tiers foram criadas/alteradas
- **Arquivo:** `historico_precos_produto` table (adicionar tier CRUD), migration
- **Risco:** Médio (auditoria, não venda)

#### PR 2d: IDs 33, 44 — Limpeza UI legacy
- **Objetivo:** Remover campos confusos `quantidade_gatilho_atacado`, validar uniqueness tier
- **Arquivo:** `ProdutoFormModal.tsx`, schema triggers
- **Risco:** Baixo-médio (UI apenas)

### Fase 3: IDs Dependentes (Onda 3)
- ID 100, 92, 99, 206, 199, 205 (fechamento por forma) → Aguarda Onda 2 estável

---

## 9. ESTRATÉGIA DE TESTES

### Testes Necessários

| Tipo | Escopo | Cobertura | Status |
|------|--------|-----------|--------|
| **Unitário** | calcularPrecoCanonico (TS) | 7 casos (varejo, tiers 10/50, transições, loja, inactive) | ✓ Existe |
| **SQL** | d0-pricing-tiers-ssot.test.sql | Order by min DESC, loja filter, ativo | ✓ Existe |
| **Integração** | caixaPrecoProduto.impl.ts | Server action, autenticação, erro i18n | ⚠️ Parcial |
| **E2E** | Scan → Reprecifica → Finaliza | Qty transitions, recibo, histórico | ✗ **FALTA** |
| **Regressão** | Varejo (qty < min) não quebra | Todos os fluxos continuam VAREJO se sem tier | ⚠️ Parcial |

### Smoke Final (não E2E)
- Manual PDV: escanear produtos (com + sem tier) e validar badge visual
- Manual recibo: F12 reimpressão com atacado histórico
- Manual venda em espera: retomar após dias, validar preço recalculado

---

## 10. RISCOS IDENTIFICADOS

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| **Preço divergente frontend/backend** | Alta | RPC revalida no finalizar_venda v4 ✓ |
| **Regressão varejo (qty<min)** | Alta | E2E deve testar ambos os casos |
| **Alteração qty não reprecifica** | Média | Debounce 350ms pode ser lento (UX) |
| **Múltiplas faixas não transitam corretamente** | Média | E2E não cobre (qty 10→50→100) |
| **Descontos + atacado inconsistência** | Média | finalizar_venda aplica desconto APÓS preço atacado (ordem?) |
| **Venda em espera preço stale** | Média | Reprecifica ao retomar ✓ (spec Fase 2) |
| **Recibo histórico tipo_preco null** | Baixa | Fallback VAREJO em caixaHistoricoRecibo ✓ |
| **Tiers inativas não escondidas UI** | Baixa | FaixasAtacadoEditor filtra ativo=true ✓ |
| **i18n erro faixa não traduzido** | Baixa | caixaMsgServidor cobre erro_srv_* ✓ |

---

## 11. RECOMENDAÇÃO: GO/NO-GO

### GO — LIBERAR PRIMEIRA PR (ID 36 E2E)

**Razão:**
- ID 36 **já está implementado e funciona** (código + integração + persistência)
- E2E test é o **único bloqueador** para validação operacional
- Teste é **rápido, low-risk, readonly**
- Resultado destranca toda a Onda 2 + identifica qualquer bug silencioso

**Critério de aceite:**
- ✓ Teste passa (scan qty 1→10 transiciona VAREJO→ATACADO)
- ✓ Preço total da venda está correto no recibo
- ✓ itens_venda.tipo_preco + regra_id estão preenchidos

**Próximo passo (pós PR 1):**
- Se passa: iniciar PRs 2a-2d em paralelo (IDs 40, 50, 51, 33, 44)
- Se falha: debugar gap (provável: falta tier no fixture, ou faixa não aplicando)

---

## 12. APÊNDICE: DEFINIÇÕES CANÔNICAS

### Faixa de Atacado (tier)
Regra: Se `quantidade_adicionada >= quantidade_minima`, aplicar `preco_unitario`.  
Exemplo: `{produtoId: "p1", quantidadeMinima: 10, precoUnitario: 80}` → qty ≥ 10 custa 80.

### Tipo de Preço
- **VAREJO:** Produto ativo sem tier aplicável (quantidade_adicionada < min de qualquer tier ativo)
- **ATACADO:** Tier ativo aplicável encontrado (quantidade >= tier.quantidade_minima)
- **MANUAL:** Operador sobrescreveu manualmente (preço_unitario_original ≠ calculado)
- **PROMOCAO:** Regra promocional aplicada (não nesta Onda)

### Reprecificação
Ato de recalcular `preço_unitario` quando `quantidade` muda.  
Triggers: scan duplicado, alteração manual qty, retomada espera, (não: criação).

### Revalidação
Ato de verificar se preço segue correto no backend antes de commit.  
Ocorre em: finalizar_venda v4 (compara preço UI vs recalculado RPC).

---

**Fim da investigação.**
