# Auditoria de Implementação — Fase 2 (Valor Percebido)

**Data:** 2026-06-27  
**Baseline:** PLANO_FASE_2_VALOR_PERCEBIDO.md  
**Status Geral:** 25% completo (1 de 4 features + parcial de 1)

---

## Executive Summary

| # | Feature | Status | Delivery | Impacto | Esforço |
|---|---------|--------|----------|---------|---------|
| 1 | Auditoria Visual | ✅ **SHIPPED** | ~100% | ALTO | Baixo ✓ |
| 2 | UX Cadastro Produto | ⚠️ **PARTIAL** | ~60% | MÉDIO | Médio |
| 3 | Faixas de Atacado | ❌ **NOT STARTED** | 0% | MÉDIO | Médio |
| 4 | Venda em Espera | ❌ **NOT STARTED** | 0% | ALTO | Alto |

**Bloqueadores Críticos:**
- Item 3 aguarda finalização de Item 2 (UX modal unificada)
- Item 4 é greenfield (sem infra existente) — maior esforço

---

## Divergências por Item

### 1️⃣ AUDITORIA VISUAL (Read-only Timeline)

**Status:** ✅ **COMPLETO E FUNCIONAL**

#### ✓ O que foi entregue:
- ✅ Rota `/admin/auditoria` fully functional
- ✅ Server Action `listarEventosAuditoria` unificando 5 ledgers
- ✅ UI completa com filtros (período, tipo evento, operador)
- ✅ Timeline cronológica com cards métricos
- ✅ Detail sheets para eventos
- ✅ RLS enforçado via `assertAdminSession`

#### ⚠️ Divergência vs Plano (Impacto: **BAIXO**)

| Divergência | Especificação | Implementação | Impacto | Mitigação |
|-------------|----------------|----------------|---------|-----------|
| **Implementação de Leitura** | RPC SQL `listar_eventos_auditoria` | TypeScript Server Action | Baixo | Funciona bem em produção; sem necessidade de migração SQL |
| **Normalização de Payload** | Feito em RPC (SQL) | Feito em TypeScript Action | Baixo | Lógica equivalente; performance OK |

**Classificação:** Feature completa. Pode ser marcada como **DONE** para Fase 2.

---

### 2️⃣ UX CADASTRO DE PRODUTO (Product Registration)

**Status:** ⚠️ **PARCIALMENTE IMPLEMENTADO** (~60%)

#### ✓ O que foi entregue:
- ✅ Modal `ProdutosEditarCatalogoModal.tsx` com 5 seções (Identificação, Precificação, Classificação, Complementar, Fiscal)
- ✅ **Indicador de margem em tempo real** (verde/amarelo/vermelho) na seção Precificação
- ✅ Validação de máscara numérica (NCM, CFOP, CST)
- ✅ Completo set de campos fiscais
- ✅ Integração com `atualizarDadosProdutoGerente()` (server action)

#### ❌ O que falta / Divergências (Impacto: **MÉDIO**)

| Divergência | Especificação | Implementação | Impacto | Roadmap |
|-------------|----------------|----------------|---------|---------|
| **Duas estruturas de modal** | Uni modal com 3 seções (Comercial, Estoque, Fiscal) **colapsado por padrão** | `NovoProdutoModal` (rápida) + `ProdutosEditarCatalogoModal` (completa) — estruturas divergentes | **MÉDIO** | Unificar em `ProdutoModal.tsx` única com modo `variant="quick"` vs `variant="full"` |
| **Seção "Fiscal" colapsada** | Fiscal **colapsado** para não intimidar | Fiscal sempre expandido em `ProdutosEditarCatalogoModal`; ausente em `NovoProdutoModal` | **MÉDIO** | Adicionar `<Accordion>` ou expandable section em modal unificada |
| **Validação inline por campo** | Mensagens de erro **por campo durante digitação** | Validação apenas **no submit** (Zod schema) | **BAIXO** | Integrar validação Zod em campo onBlur; mensagens em `<FormControl.Error>` |
| **Margem em tempo real (item 2)** | Funciona em `ProdutosEditarCatalogoModal` | Falta **completamente** em `NovoProdutoModal` | **MÉDIO** | Copiar lógica de margin calc para modal rápida |
| **Atalho de teclado para salvar** | `Ctrl+S` (Windows) / `Cmd+S` (Mac) salva | Não implementado | **BAIXO** | Adicionar `useKeyboardShortcut` em modal |
| **"Salvar e cadastrar outro"** | Botão que mantém modal aberta, limpa form, avança foco | Não implementado | **BAIXO** | Estado `continueAdding` + callback após sucesso |

**Files:**
- `/home/user/fastproduct/pdv-importados/components/gerente/produtos/NovoProdutoModal.tsx`
- `/home/user/fastproduct/pdv-importados/components/gerente/produtos/ProdutosEditarCatalogoModal.tsx`

**Bloqueador:** Item 3 depende de uma **modal única e estável** para integrar a seção de faixas de atacado.

---

### 3️⃣ GESTÃO VISUAL DE FAIXAS DE ATACADO (Wholesale Pricing Tiers)

**Status:** ❌ **NÃO INICIADO** (0%)

#### ✓ Infraestrutura existente no DB:
- ✅ Tabela `public.precos_atacado` (migration 077) com schema correto
- ✅ Função `calcular_preco_produto()` implementada e testada
- ✅ RLS policies em vigência
- ✅ Índices e constraints validados

#### ❌ Camada de gerenciamento **completamente ausente**:

| Elemento | Especificação | Status | Impacto | Esforço |
|----------|----------------|--------|---------|---------|
| **RPC `upsert_faixa_atacado`** | INSERT/UPDATE com validação margem | ❌ NÃO EXISTE | CRÍTICO | 1–2h |
| **RPC `remover_faixa_atacado`** | DELETE com cascata segura | ❌ NÃO EXISTE | CRÍTICO | 30min |
| **Server Action `upsert_faixa`** | TypeScript wrapper + RLS enforcement | ❌ NÃO EXISTE | CRÍTICO | 1h |
| **Server Action `remover_faixa`** | TypeScript wrapper | ❌ NÃO EXISTE | CRÍTICO | 30min |
| **UI: Componente Grade** | `DataTable` exibindo tiers com edit inline | ❌ NÃO EXISTE | CRÍTICO | 3–4h |
| **UI: Modal/Sheet Editor** | `DragonModal` para criar/editar faixa | ❌ NÃO EXISTE | CRÍTICO | 2–3h |
| **UI: Pré-visualização** | "Para X un, preço = Y" (live) | ❌ NÃO EXISTE | MÉDIO | 1h |
| **UI: Validação Inline** | Detectar sobreposição de qtd; margem negativa | ❌ NÃO EXISTE | MÉDIO | 1–2h |
| **Integração Modal Produto** | Nova seção "Faixas de Atacado" em modal unificada | ❌ NÃO EXISTE | CRÍTICO | 1h |

**Total de esforço estimado:** ~13–15 horas

**Bloqueador:** Aguarda **Item 2** (UX Cadastro unificada) para integração limpa.

**Padrão de implementação:**
1. Criar RPCs em migration nova (250+)
2. Criar Server Actions em `app/gerente/produtos/actions.ts`
3. Criar componente `FaixasAtacadoEditor.tsx` (reutilizável)
4. Integrar como seção da modal unificada do Item 2

---

### 4️⃣ VENDA EM ESPERA (Parked Sale)

**Status:** ❌ **NÃO INICIADO** (0% — Greenfield)

#### ✗ Tudo falta:

| Componente | Especificação | Status | Impacto | Esforço |
|-----------|----------------|--------|---------|---------|
| **Migration: `vendas_em_espera`** | Tabela + RLS + índices | ❌ NÃO EXISTE | CRÍTICO | 1–2h |
| **RPC `colocar_venda_em_espera`** | INSERT com snapshot JSONB | ❌ NÃO EXISTE | CRÍTICO | 1–2h |
| **RPC `retomar_venda_em_espera`** | SELECT, restaurar cart, recalcular preço | ❌ NÃO EXISTE | CRÍTICO | 1–2h |
| **RPC `descartar_venda_em_espera`** | UPDATE status + auditoria | ❌ NÃO EXISTE | CRÍTICO | 1h |
| **Zustand: `salvarEmEspera()`** | Serializar cart + chamar RPC | ❌ NÃO EXISTE | CRÍTICO | 1h |
| **Zustand: `carregarDeEspera(payload)`** | Restaurar cart do snapshot | ❌ NÃO EXISTE | CRÍTICO | 1h |
| **UI: Botão "Colocar em Espera"** | Em `CaixaPdvOperacoesButtons.tsx` | ❌ NÃO EXISTE | CRÍTICO | 30min |
| **UI: Modal "Rotular Venda"** | Input para rótulo + confirm | ❌ NÃO EXISTE | CRÍTICO | 1h |
| **UI: Aba "Em Espera"** | Nova aba em `CaixaPdvOperadorTabs.tsx` | ❌ NÃO EXISTE | CRÍTICO | 1h |
| **UI: Grade de Vendas em Espera** | Listagem de vendas, retomar/descartar | ❌ NÃO EXISTE | CRÍTICO | 2–3h |
| **UI: Detail Modal** | Expandir venda com itens, total, cliente | ❌ NÃO EXISTE | CRÍTICO | 1–2h |
| **Hardening: Estoque zerado** | Sinalizar itens indisponíveis ao retomar | ❌ NÃO EXISTE | MÉDIO | 1h |
| **Hardening: Token expirado** | Remover desconto gerente, exigir novo | ❌ NÃO EXISTE | MÉDIO | 1h |
| **Hardening: Limpeza automática** | Descartar após fechamento de caixa | ❌ NÃO EXISTE | BAIXO | 1h |

**Total de esforço estimado:** ~18–24 horas

**Interdependências:**
- Não bloqueia Items 1–3
- Usa infraestrutura existente (carrinho, RPC patterns, design system)
- Pode ser implementado em paralelo com Item 3

**Padrão recomendado:**
1. Migration + RPCs (4–5h)
2. Zustand extensions (2–3h)
3. PDV UI: botão + modal rótulo (2–3h)
4. PDV UI: aba listagem + detail (4–5h)
5. Hardening + limpeza (2–3h)

---

## Classificação de Impacto das Divergências

### 🔴 CRÍTICO (bloqueador de release)
- **Item 3 não tem camada de management** — tabela existe mas ninguém consegue usar. Spec promete "configure faixas pela interface", usuário não consegue.
- **Item 4 completamente greenfield** — zero implementação de um dos 4 pillars do plano.

**Ação:** Ambos precisam de implementação completa antes de marcar Fase 2 como "completa".

---

### 🟠 ALTO (afeta valor percebido)
- **Item 2: duas modals divergentes** — spec pedia modal unificada com comportamento consistente. Hoje "novo" é rápido (sem fiscal), "editar" é completo (com fiscal). Confunde UX.
- **Item 2: margem falta em NovoProdutoModal** — dono não enxerga margem ao cadastrar rápido.

**Ação:** Unificar modals; duplicar lógica de margin.

---

### 🟡 MÉDIO (melhoria de usabilidade)
- **Item 2: validação inline falta** — usuário não enxerga erro de campo até submit.
- **Item 2: fiscal não é colapsável** — tabela fiscal intimida; devia estar fechada por padrão.
- **Item 2: "Salvar e cadastrar outro" falta** — lote de cadastros fica lento.
- **Item 4: hardening de token/estoque** — não quebra fluxo, mas deixa edge cases sem proteção.

**Ação:** Implementar de forma incremental.

---

### 🟢 BAIXO (polimento)
- **Item 1: RPC vs Server Action** — funciona bem assim.
- **Item 2: atalho de teclado Ctrl+S** — nice-to-have.

**Ação:** Deixar como "futurar" ou bônus se sobrar tempo.

---

## Roadmap de Correção (Fases de Implementação)

### Princípios:
1. **Fundações primeiro:** Unificar UX (Item 2) antes de expandir (Item 3)
2. **Independência onde possível:** Item 4 pode rodar paralelo a Item 3 após Phase 1
3. **Risco zero:** Não tocar núcleo (venda, estoque, caixa)
4. **Valor incremental:** Cada fase entrega valor ao lojista

---

## **FASE 1: Fundações (Semana 1–2 | ~12h)**

### Objetivo: Unificar e polir Item 2

**Escopo:**
1. **Unificar modals de Produto** (NovoProdutoModal + ProdutosEditarCatalogoModal → ProdutoModal.tsx unificada)
   - Modo `variant="quick"` (rápido, sem fiscal)
   - Modo `variant="full"` (completo, com fiscal colapsado)
   - Reusar mesma estrutura de seções
   - **Estimado:** 4–5h

2. **Adicionar margem em tempo real a NovoProdutoModal**
   - Copiar lógica de cálculo de `ProdutosEditarCatalogoModal`
   - Colorir (red/amber/green)
   - **Estimado:** 1–2h

3. **Validação inline por campo**
   - Integrar Zod validation em campo onBlur
   - Mostrar erro inline (não só no submit)
   - **Estimado:** 2h

4. **Fiscal colapsável por padrão**
   - Envolver campos fiscais em `<Accordion>`
   - Aberto por default em `variant="full"`, fechado em `variant="quick"`
   - **Estimado:** 1h

5. **Atalho Ctrl+S para salvar** (nice-to-have)
   - **Estimado:** 30min–1h

**Deliverable:** Modal unificada, estável, pronta para Item 3

**Test Plan:**
- Cadastrar produto rápido (sem fiscal) ✅
- Editar completo (com fiscal) ✅
- Validação em tempo real ✅
- Salvar com Ctrl+S ✅
- Margem reflete alterações de preço em tempo real ✅

**Teste em Staging:** Toda a operação de cadastro de produto sem regressões

---

## **FASE 2: Gestão Visual de Faixas (Semana 2–3 | ~14h)**

### Objetivo: Entregar Item 3 (Gestão de Faixas de Atacado)

**Dependência:** Phase 1 ✅

**Escopo:**
1. **Migration + RPCs** (estimado 4–5h)
   - Criar migration 251 com:
     - `upsert_faixa_atacado(p_produto_id, p_loja_id, p_quantidade_minima, p_preco_unitario)`
     - `remover_faixa_atacado(p_faixa_id)`
     - Validação margem inline
     - Validação sobreposição de quantidade
   - Testar RLS (gerente vê, operador não)

2. **Server Actions** (estimado 2–3h)
   - `upsertFaixa(formData)` — wrapper TypeScript
   - `removerFaixa(fauxaId)` — DELETE via RPC
   - Tratamento de erro + toast

3. **Componente FaixasAtacadoEditor** (estimado 4–5h)
   - `DataTable` exibindo tiers (`quantidade_minima`, `preco_unitario`, `ativo`, ações)
   - Botão "Adicionar faixa"
   - Edit inline (click → Sheet modal)
   - Delete (com confirm)
   - Pré-visualização "Para X un → preço Y"
   - Validação visual de sobreposição

4. **Integração em ProdutoModal** (estimado 1–2h)
   - Nova seção "Faixas de Atacado" na modal unificada (Phase 1)
   - Aparecer sob "Precificação" ou como aba própria
   - Renderizar `<FaixasAtacadoEditor produto_id={...} />`

5. **Testes** (estimado 2–3h)
   - Criar faixa válida ✅
   - Criar faixa com margem negativa (bloqueado) ✅
   - Editar faixa ✅
   - Deletar faixa ✅
   - No PDV, lançar 5un → preço 1 correto ✅
   - RLS: gerente vê/edita, operador não ✅

**Deliverable:** Faixas de atacado totalmente gerenciáveis pela UI; PDV aplica automaticamente

**Test Plan:**
- Criar faixa (5un=R$90) ✅
- Lançar no PDV (7un) → aplica faixa 5un ✅
- Deletar faixa → PDV volta para catálogo simples ✅
- Margem negativa bloqueado ✅
- RLS isolamento ok ✅

**Teste em Staging:** Fluxo de atacado escalado (5un/10un/20un) funciona end-to-end

---

## **FASE 3: Venda em Espera (Semana 3–4 | ~20h)**

### Objetivo: Entregar Item 4 (Parked Sale)

**Dependência:** Nenhuma (pode rodar paralelo a Phase 2)

**Escopo:**
1. **Migration + RPCs** (estimado 4–5h)
   - Criar migration 252 com tabela `vendas_em_espera`:
     - `id uuid`, `loja_id fk`, `operador_id fk`, `caixa_id fk optional`, `rotulo text`, `itens jsonb`, `totais jsonb`, `cliente_id fk optional`, `desconto_gerente_percentual numeric optional`, `status enum`, `criada_em`, `atualizada_em`, `descartada_motivo text`
     - Índices: (loja_id, operador_id), (loja_id, status)
     - RLS policies (operador vê próprias, gerente vê loja)
   - RPCs:
     - `colocar_venda_em_espera(p_itens, p_totais, p_rotulo, ...)`
     - `retomar_venda_em_espera(p_id)` — retorna snapshot, valida estoque/cliente/token
     - `descartar_venda_em_espera(p_id, p_motivo)`
   - Testes RLS + concorrência

2. **Zustand Extensions** (estimado 2–3h)
   - `salvarEmEspera(rotulo?: string)` → serializa cart, chama RPC, limpa cart
   - `carregarDeEspera(payload)` → restaura cart do snapshot, recalcula preço
   - Estado: `parkedSales[]`, `selectedParkedSale`

3. **PDV UI — Botão e Modal de Rótulo** (estimado 2–3h)
   - Botão "Colocar em Espera" em `CaixaPdvOperacoesButtons.tsx`
   - Clique abre `PutOnHoldDialog` (modal de input `rotulo` + confirm)
   - Cancelar → limpa cart, mostra toast "Venda em espera: [rótulo]"

4. **PDV UI — Aba "Em Espera"** (estimado 3–4h)
   - Nova aba em `CaixaPdvOperadorTabs.tsx` (entre "Cliente" e "Pagamento")
   - Exibe:
     - Grade de vendas em espera do operador/loja (rotulo, total, itens, criada_em, ações)
     - Botão "Retomar" → restaura cart (com validação de estoque)
     - Botão "Descartar" → abre modal de motivo
     - Detalhe ao clicar na linha (sheet com itens, valores, cliente)

5. **Hardening** (estimado 3–4h)
   - **Estoque zerado ao retomar:** Validar availability, sinalizar itens indisponíveis com ⚠️ em vermelho
   - **Token de desconto expirado:** Se `desconto_gerente_token` venceu, remover desconto e exigir reauth gerente
   - **Limpeza automática:** Após fechamento de caixa, marcar com `DESCARTADA` (não deletar; auditoria)
   - Tratamento de erro robusto (rede, race condition, etc.)

6. **Testes** (estimado 3–4h)
   - Montar carrinho (itens + desconto + cliente) ✅
   - Colocar em espera ✅
   - Atender outro cliente ✅
   - Retomar → cart idêntico ✅
   - Preço recalculado ✅
   - Descartar venda em espera ✅
   - Motivo auditado ✅
   - Estoque zerado durante espera → bloqueado ao retomar ✅
   - Token expirado → desconto removido ✅
   - RLS: operador vê só as suas ✅
   - Múltiplos operadores, isolamento ok ✅
   - Stress test: 10 vendas em espera → performance ok

**Deliverable:** PDV fluido; operador atende vários clientes sem perder carrinho

**Test Plan:**
- Fast flow: montar → colocar em espera → retomar → finalizar ✅
- Edge case: item zerou estoque enquanto em espera → bloqueado
- Edge case: gerente autorizou desconto, token expirou → desconto removido
- Multi-operador: op1 em espera não afeta op2
- Loja A: venda em espera isolada de Loja B

**Teste em Staging:** Operador realmente consegue atender 3 clientes simultâneos sem perder carrinho

---

## **FASE 4 (Opcional): Polimentos** | ~5h

Após Phases 1–3:

1. **"Salvar e cadastrar outro"** em ProdutoModal (Item 2)
2. **Atalhos de teclado** (Ctrl+S, Enter navega)
3. **Analytics**: rastrear quantas vendas em espera, tempo médio, taxa de conversão
4. **Notificação**: alertar gerente quando venda em espera > 10min (descarte automático?)

---

## Resumo Executivo do Roadmap

| Fase | Feature | Duração | Esforço | Bloqueador | Valor |
|------|---------|---------|---------|-----------|-------|
| **0** | Auditoria Visual | DONE | ✅ | — | ✅ Alto |
| **1** | UX Cadastro (fundações) | Semana 1–2 | 12h | — | ✅ Alto |
| **2** | Faixas de Atacado | Semana 2–3 | 14h | Phase 1 ✅ | ✅ Médio |
| **3** | Venda em Espera | Semana 3–4 | 20h | Nenhuma | ✅ Alto |
| **4** | Polimentos | Semana 4+ | 5h | — | 🟡 Baixo |

**Timeline Total:** ~51 horas (~2 semanas full-time, ou 4–5 semanas part-time)

**Path to MVP (done + parte crítica):**
- Fase 1 ✅
- Fase 2 ✅
- Fase 3 ✅
- = ~46h = **2 semanas solid**

---

## Próximos Passos (Imediatos)

1. **Revisar e aprovar** este roadmap
2. **Iniciar Fase 1** (unificar modal de produtos)
3. **Criar branch:** `feat/fase-2-fundacoes-uix-produto`
4. **Criar PR + tracking** em GitHub com checklist por fase
5. **Agendamento:** Fase 1 completa até final de semana (sprint semanal)

---

## Referências

- **Master Plan:** `/home/user/fastproduct/docs/PLANO_FASE_2_VALOR_PERCEBIDO.md`
- **Arquitetura Produto:** `/home/user/fastproduct/docs/LAYOUT_KERNEL_ERP.md`
- **Design System:** Radix UI (admin-v2 + PDV utilities)
- **Banco:** `precos_atacado` table está pronto (migration 077); `vendas_em_espera` será migration 252

---

**Status:** ✅ Auditoria Completa | 🔄 Aguardando Aprovação de Roadmap
