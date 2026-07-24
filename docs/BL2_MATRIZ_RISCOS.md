# BL-2 — Matriz de Riscos: Promoções
**Data**: 2026-07-24  
**Status**: 🚨 **ANÁLISE DE RISCO COMPLETA**  
**Autor**: Claude (claude-haiku-4-5-20251001)  
**Baseado em**: BL2_ANALISE_INICIAL.md + Auditoria técnica

---

## Executive Summary

Esta matriz consolida **14 riscos identificados** em BL-2 (Promoções), classificados por severidade. **3 são P0 (bloqueadores)**, **5 são P1 (críticos)**, **6 são P2 (médios)**. Mitigações propostas reduzem risco geral de **ALTO** para **MÉDIO-BAIXO**.

| Severidade | Contagem | Gating | Status |
|------------|----------|--------|--------|
| **P0 (Bloqueador)** | 3 | ❌ Sem mitigação = Não Go-Live | 🔴 **CRÍTICO** |
| **P1 (Crítico)** | 5 | ⚠️ Requer mitigação | 🟡 **ALTO** |
| **P2 (Médio)** | 6 | ℹ️ Monitoramento | 🟢 **MÉDIO** |

---

## Riscos Identificados

### RISCO P0-01: Tipo de Preço `PROMOCAO` Não Suportado em DB ❌

| Campo | Valor |
|-------|-------|
| **Severidade** | 🔴 P0 (Bloqueador) |
| **Probabilidade** | 🔴 **Certo** (100%) |
| **Impacto** | 🔴 **Crítico** — Todos operadores afetados |
| **Detecção** | 🟢 Automática (erro SQL em produção) |
| **Janela Temporal** | 📍 **Fase 0** (1ª migração) |

**Descrição**:
O CHECK constraint em `itens_venda.tipo_preco` (migration 001, linha 208) aceita apenas `('VAREJO', 'ATACADO', 'MANUAL')`. Se operador tenta finalizar venda com item `tipo_preco='PROMOCAO'`, insert falhará:
```
ERROR: new row for relation "itens_venda" violates check constraint "itens_venda_tipo_preco_check"
```

**Causa Raiz**:
- Migration 001 (schema inicial) criou constraint restritivo
- Nenhuma migration posterior adicionou 'PROMOCAO'
- Código frontend/backend assume 'PROMOCAO' é válido (tipos TS)

**Cenário de Falha**:
1. Operador escaneia produto com promoção ativa
2. Sistema calcula preço com desconto (tipo_preco='PROMOCAO')
3. Operador clica "Finalizar"
4. RPC tenta inserir em `itens_venda`
5. ❌ CHECK constraint rejeita
6. 🛑 Venda NÃO é finalizada
7. 📱 PDV exibe erro genérico ao operador

**Impacto Negócio**:
- Perda de vendas (clientes desistem)
- Frustração operador (não consegue vender)
- Suporte escalado

**Mitigação** (Obrigatória):
- ✅ **Ação**: Criar migration 273 para adicionar 'PROMOCAO' ao CHECK constraint
- ✅ **Timing**: Executar na **Fase 0** (antes de qualquer deploy BL-2)
- ✅ **Validação**: SQL test confirma tipo='PROMOCAO' é aceito
- ✅ **Rollback**: Revert migration (idempotência garantida)

**Owner**: Backend Engineer  
**Target Resolução**: Antes de Fase 1  
**Status**: 🟡 **Em Planejamento (migration 273 drafted)**

---

### RISCO P0-02: Duplicação de Lógica de Precificação (Frontend vs Backend) ❌

| Campo | Valor |
|-------|-------|
| **Severidade** | 🔴 P0 (Bloqueador) |
| **Probabilidade** | 🟠 **Alta** (70%) |
| **Impacto** | 🔴 **Crítico** — SSOT quebrada |
| **Detecção** | 🟠 Manual (auditoria de código) |
| **Janela Temporal** | 📍 **Fase 3** (integração frontend) |

**Descrição**:
Se frontend **recalcula** preço de promoção independentemente do backend, há desacordo: cliente vê R$80, servidor calcula R$90. Isso viola SSOT (Single Source of Truth) — a autoridade de preço deve ser única.

**Causa Raiz**:
- `PricingService.ts` (shared) permite frontend aplicar promo
- Sem mecanismo de "interlock" entre frontend e backend
- Possibilidade: frontend apressa, backend revalida (lag)

**Cenário de Falha**:
1. Frontend busca `regras_preco` em segundo plano
2. Frontend calcula desconto aplicável
3. Frontend exibe preço desconto (R$80)
4. Operador finaliza venda
5. Backend revalida: regra expirou nos últimos 100ms
6. Backend calcula preço sem desconto (R$100)
7. ❌ Divergência: cliente vê R$80, é cobrado R$100

**Impacto Negócio**:
- Fraude potencial (cliente paga menos)
- Compliance: auditoria não coincide
- Customer churn (desconfiança)

**Mitigação** (Obrigatória):
- ✅ **Arquitetura**: Frontend **não calcula** promo, apenas **exibe** (hint)
- ✅ **Busca**: Frontend pode buscar regras_preco para UI (info-only)
- ✅ **Aplicação**: RPC `buscar_promocoes_ativas` retorna **final** e **revalida** em finalizar_venda_canonica_v4
- ✅ **Validação**: RPC rejeita se regra não mais ativa (com epsilon de tempo)
- ✅ **Code Review**: Garantir que `PricingService.aplicarPromocao()` é chamado **apenas** no backend (Deno RPC)

**Owner**: Architecture / Backend  
**Target Resolução**: Antes de Fase 3 (code review)  
**Status**: 🟡 **Em Discussão (decisão de design pendente)**

---

### RISCO P0-03: Limite de Desconto Total Não Enforçado ❌

| Campo | Valor |
|-------|-------|
| **Severidade** | 🔴 P0 (Bloqueador) |
| **Probabilidade** | 🟠 **Média** (50%) |
| **Impacto** | 🔴 **Crítico** — Margem erodida |
| **Detecção** | 🟠 Auditoria mensal (lag) |
| **Janela Temporal** | 📍 **Fase 2** (RPC validation) |

**Descrição**:
Sistema permite acumular descontos ilimitadamente:
- Promoção -30% (sobre preco_varejo)
- Desconto manual -20% (em alguns itens)
- Desconto gerente -10% (global)
- **Total**: 60% = vendendo com 40% de margem

Se custo é R$50 e preço varejo R$100:
- Com 60% desconto: preço final = R$40
- **Margem**: -10% (PREJUÍZO)

**Causa Raiz**:
- RPC `finalizar_venda_canonica_v4` não valida limite total
- `pdv_config` tem limites individuais, não **total**
- Sem middleware que sintetiza todos os descontos

**Cenário de Falha**:
1. Gerente cria promoção -50% em categoria premium (intent: atacado)
2. Operador aplica desconto manual adicional -15%
3. Gerente autoriza desconto global -20%
4. **Total desconto**: 85% (matemática: (1-0.5) * (1-0.15) * (1-0.2) = 0.34 de preço)
5. Venda é finalizada
6. ❌ Negócio descobriu que vendeu com margem negativa

**Impacto Negócio**:
- Perda financeira direta
- Compliance: auditoria com questões
- Confiança de stakeholder reduzida

**Mitigação** (Obrigatória):
- ✅ **Config**: Adicionar `max_desconto_total_percentual` em `pdv_config` (default 60%)
- ✅ **Validação**: RPC `finalizar_venda_canonica_v4` calcula total e rejeita se > limite
- ✅ **Fórmula**: `(totalBruto - totalLiquido) / totalBruto ≤ maxDesconto`
- ✅ **Logging**: Se rejeitado, logar tentativa com detalhe de cada desconto
- ✅ **Teste**: E2E testa limite (9 dos 15+ testes de BL-2)

**Owner**: Backend + Business  
**Target Resolução**: Antes de Fase 2 (RPC validation)  
**Status**: 🟡 **Em Planejamento (config key definido, sem implementação)**

---

### RISCO P1-01: Concorrência em `regras_preco` (Leitura vs Escrita) ⚠️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟠 P1 (Crítico) |
| **Probabilidade** | 🟠 **Média** (40%) |
| **Impacto** | 🟠 **Alto** — Promoção inconsistente |
| **Detecção** | 🔴 Difícil (race condition) |
| **Janela Temporal** | 📍 **Fase 1+** (runtime) |

**Descrição**:
Gerente edita promoção (ativa=true → ativo=false) enquanto operador finaliza venda. Promo ainda é aplicada porque fetch ocorreu antes da update.

**Causa Raiz**:
- `regras_preco` é leitura solta (sem lock)
- Sem transação que garanta consistência

**Cenário de Falha**:
1. 14:59:50 - Operador busca promoções: vê "Promo BlackFriday -30%, expira 15:00"
2. 14:59:55 - Gerente vê que é 15h em São Paulo, desativa promoção
3. 14:59:58 - Operador adiciona produto ao carrinho, aplica promo
4. 15:00:00 - Operador finaliza venda
5. 15:00:01 - RPC revalida regra: ativa=false
6. ❌ RPC rejeita venda (venda já inserida no carrinho, mas RPC bloqueia finalização)

**Impacto Negócio**:
- Venda perdida em fronteira de promoção
- Operador frustrado (não sabe porquê)

**Mitigação** (Recomendada):
- ✅ **Read-only snapshot**: Operador vê promoção "a partir de quando buscar", não em tempo real
- ✅ **Tolerância temporal**: RPC aceita revalidação com delta de ±2 minutos (buffer)
- ✅ **Logging**: Se rejeita por idade, logar e sugerir retry ao operador
- ⚠️ **Advisory lock** (opcional): Usar `pg_advisory_lock` em `regras_preco` durante finalização (complexidade +)

**Owner**: Backend  
**Target Resolução**: Antes de Fase 4 (E2E)  
**Status**: 🟡 **Em Discussão (sem implementação mandatória)**

---

### RISCO P1-02: Auditoria Incompleta de Promoção ⚠️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟠 P1 (Crítico) |
| **Probabilidade** | 🔴 **Certo** (100%) |
| **Impacto** | 🟠 **Alto** — Compliance |
| **Detecção** | 🟢 Automática (query na auditoria) |
| **Janela Temporal** | 📍 **Fase 1** (schema) |

**Descrição**:
Se `itens_venda.regra_aplicada_id` **não é preenchido**, auditoria não consegue rastrear qual promoção foi aplicada. Impossível responder: "Qual foi a promoção nesta venda?"

**Causa Raiz**:
- Migration 273 adiciona coluna, mas RPC não a popula obrigatoriamente
- Frontend não envia `regra_id` ao RPC

**Cenário de Falha**:
1. Venda é finalizada com promoção
2. Auditor busca: `SELECT * FROM itens_venda WHERE venda_id = X`
3. `regra_aplicada_id` está NULL
4. ❌ Não sabe qual regra foi aplicada

**Impacto Negócio**:
- Compliance risk (não consegue explicar desconto)
- Análise de ROI de promoção impossível
- Support request: "Por que cliente pagou R$80?"

**Mitigação** (Obrigatória):
- ✅ **Schema**: Adicionar `regra_aplicada_id UUID NOT NULL DEFAULT gen_random_uuid()` (ou deixar nullable se opcional)
- ✅ **RPC**: Inserção obrigatória do `p_regra_id` no item
- ✅ **Validação**: RPC rejeita item se tipo_preco='PROMOCAO' e regra_id é NULL
- ✅ **Testing**: 100% de `regra_aplicada_id` preenchido (teste de integridade)

**Owner**: Backend  
**Target Resolução**: Antes de Fase 2 (RPC validation)  
**Status**: 🟡 **Em Planejamento (coluna adicionada, validação pendente)**

---

### RISCO P1-03: Promoção Expirada Ainda é Aplicada ⚠️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟠 P1 (Crítico) |
| **Probabilidade** | 🟠 **Média** (50%) |
| **Impacto** | 🟠 **Alto** — Desconto indevido |
| **Detecção** | 🟠 Manual (relatório) |
| **Janela Temporal** | 📍 **Fase 2-3** (runtime) |

**Descrição**:
Promoção com `data_validade='2026-07-31 23:59:59'` é buscada exatamente às 23:59:59.999. Clock skew entre frontend e backend causa timestamp a divergir (frontend tem -100ms lag). Promoção é considerada ativa no frontend, expirada no backend.

**Causa Raiz**:
- Sem sincronização de relógio (NTP)
- Sem buffer temporal (epsilon)
- Validação loose em frontend, strict em backend

**Cenário de Falha**:
1. Promoção expira "oficialmente" em 2026-07-31 23:59:59 UTC
2. Frontend: relógio local mostra 23:59:58 (100ms atrasado)
3. Frontend busca promoções: WHERE data_validade IS NULL OR data_validade > now() → ✅ encontra
4. Operador aplica promoção
5. Backend: relógio UTC mostra 23:59:60 (sincronizado)
6. RPC revalida: data_validade < now() → ❌ expirada
7. RPC rejeita venda

**Impacto Negócio**:
- Venda perdida na fronteira de promoção
- Customer churn (raiva)
- Baixa confiança em promo

**Mitigação** (Recomendada):
- ✅ **Epsilon**: RPC aceita validação com delta de ±5 minutos (config)
- ✅ **NTP**: Garantir todos servidores sincronizados (Supabase já faz)
- ✅ **Logging**: Se quase-expirada, logar warning
- ✅ **UI Hint**: Se data_validade < agora + 1 hora, exibir "Promo expira em Xh"

**Owner**: Backend + DevOps  
**Target Resolução**: Antes de Fase 4 (E2E)  
**Status**: 🟡 **Em Discussão (epsilon = 5min default)**

---

### RISCO P1-04: Limite de Desconto por Item Ignorado com Promoção ⚠️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟠 P1 (Crítico) |
| **Probabilidade** | 🟠 **Média** (60%) |
| **Impacto** | 🟡 **Médio-Alto** — Configuração contradiz |
| **Detecção** | 🟠 Manual (validação) |
| **Janela Temporal** | 📍 **Fase 2** (RPC) |

**Descrição**:
RPC `finalizar_venda_canonica_v4` valida `desconto_manual_item_percentual ≤ 15%` (trigger em migration 122). Mas não existe validação similar para `desconto_regra_percentual` em itens com tipo_preco='PROMOCAO'.

**Exemplo**:
- Configuração: max_desconto_manual_item_percentual = 15%
- Promoção: -50% em camisetas (não respeita limite)
- Operador: não consegue dar desconto manual -20% (trigger bloqueia)
- Mas: promoção -50% passa sem validação

**Causa Raiz**:
- Trigger (migration 122) valida apenas desconto manual (`tipo_preco='MANUAL'`)
- Não há validação para `tipo_preco='PROMOCAO'`
- Inconsistência de regras

**Cenário de Falha**:
1. Config: max_desconto_manual_item_percentual = 15%
2. Promoção: -80% em produto X
3. Operador não consegue dar desconto adicional (limite)
4. Promoção já deu desconto de 80% (sem limite)
5. ❌ Inconsistência: manual é limitado, promo não

**Impacto Negócio**:
- Política de desconto não é consistente
- Configuração é ignorada (confiança reduzida)

**Mitigação** (Recomendada):
- ✅ **Validação em RPC**: Rejeitar item com `tipo_preco='PROMOCAO'` se desconto > max_manual (ou deixar exclusão explícita)
- ✅ **Config**: Adicionar `max_desconto_promo_item_percentual` (ou reutilizar manual_item)
- ✅ **Documentação**: Explicar que promoção pode violar limite (decisão de design)

**Owner**: Backend + Business  
**Target Resolução**: Antes de Fase 2 (RPC validation)  
**Status**: 🟡 **Em Discussão (sem decisão de política)**

---

### RISCO P1-05: Performance: Busca de Promoções é Lenta ⚠️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟠 P1 (Crítico) |
| **Probabilidade** | 🟠 **Média** (40%) |
| **Impacto** | 🟠 **Alto** — UX degradada |
| **Detecção** | 🟢 Automática (APM) |
| **Janela Temporal** | 📍 **Fase 3+** (runtime) |

**Descrição**:
RPC `buscar_promocoes_ativas()` (proposto na migration 275) faz scan de `regras_preco` sem índices apropriados. Com 10K regras, busca por produto/categoria pode levar 500ms+, bloqueando operador.

**Causa Raiz**:
- Índices adicionados em migration 273 (idx_regras_preco_ativas_*), mas podem não ser suficientes
- Query JOIN com `categorias` (se aplicável) sem índice
- Sem caching

**Cenário de Falha**:
1. Operador escaneia produto (chamada RPC buscar_promocoes_ativas)
2. RPC toma 800ms (tabela scan)
3. PDV "travado" por 800ms
4. 🛑 Operador aguarda
5. Operador pressiona "Cancelar", tenta novamente
6. Fila de requisições cresce

**Impacto Negócio**:
- Throughput de vendas reduzido
- Operador frustrado
- Peak hours = inoperável

**Mitigação** (Recomendada):
- ✅ **Índices**: Garantir índices em `(produto_id, ativo, data_validade)`
- ✅ **Particionamento**: Se tabela > 50K regras, particionar por data_validade
- ✅ **Caching**: Redis cache de promoções ativas (TTL 5min)
- ✅ **APM**: Monitorar latência RPC (alert se > 300ms)
- ✅ **Teste de carga**: Simular 10K regras, medir tempo

**Owner**: Backend + DevOps  
**Target Resolução**: Antes de Fase 5 (staging)  
**Status**: 🟡 **Em Planejamento (índices drafted, caching optional)**

---

### RISCO P2-01: Promoção Quebra SSOT se Aplicada Diferente Forma Offline ℹ️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟡 P2 (Médio) |
| **Probabilidade** | 🟠 **Média** (40%) |
| **Impacto** | 🟡 **Médio** — Sincronização |
| **Detecção** | 🟠 Auditoria (diff pré/pós) |
| **Janela Temporal** | 📍 **Fase 5** (offline) |

**Descrição**:
PDV Local (desktop offline) aplica promoção baseada em cache local de `regras_preco`. Depois sincroniza com servidor. Se regra foi modificada/deletada no servidor, sync falha e auditoria não bate.

**Causa Raiz**:
- PDV Local tem cache de regras (não-transacional)
- Servidor é autoridade, mas offset temporal (offline)
- Sem mecanismo de versioning de regras

**Cenário de Falha**:
1. 14:00 - PDV Local sincroniza `regras_preco` (cache local)
2. 14:10 - Gerente no servidor desativa promoção X
3. 14:20 - PDV Local offline, operador finaliza venda com promo X (do cache)
4. 14:50 - PDV Online, tenta sincronizar venda
5. ❌ Servidor revalida: promo X não mais ativa
6. Sync falha, venda não é finalizada
7. Operador perde venda, tem que refazer

**Impacto Negócio**:
- Venda perdida
- Operador frustrado (offline não funciona)
- Confiança em sistema reduzida

**Mitigação** (Recomendada):
- ✅ **Versioning**: Adicionar `versao` em `regras_preco`, incrementar ao atualizar
- ✅ **PDV Cache**: Armazenar versão localmente, comparar ao sincronizar
- ✅ **Tolerância**: Server aceita venda "offline" com promo obsoleta (registra desvio)
- ✅ **Logging**: Se promo fora de sync, logar e marcar para auditoria

**Owner**: Backend + PDV Local  
**Target Resolução**: Antes de Fase 5 (offline testing)  
**Status**: 🟢 **Mitigação Aceitável (offline é cenário secundário)**

---

### RISCO P2-02: UI Operador Exibe Promo, Mas Não Sabe Quantificar ℹ️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟡 P2 (Médio) |
| **Probabilidade** | 🔴 **Certo** (100%) — sem UI) |
| **Impacto** | 🟡 **Médio** — UX |
| **Detecção** | 🟢 Manual (observação) |
| **Janela Temporal** | 📍 **Fase 3** (frontend) |

**Descrição**:
Se UI não exibe quantia de desconto (apenas "🎉 Promoção ativa"), operador não consegue responder ao cliente "qual é a promoção?" Reduz transparency.

**Exemplo**:
- Operador vê: "🎉 Promo Black Friday"
- Cliente pergunta: "Quanto desconto?"
- Operador: "Não sei, só vejo que tem promo"

**Causa Raiz**:
- UI não foi implementada (Fase 3 não feita)
- Falta de informação visual

**Cenário de Falha**:
1. Operador adiciona produto ao carrinho
2. Promo aplicada, preço reduzido
3. Cliente não acredita no preço (sem entender promo)
4. Cliente pede para removê-la
5. Operador confuso (não sabe remover)

**Impacto Negócio**:
- Customer satisfaction reduzida
- Promo não alcança objetivo (cliente não quer)

**Mitigação** (Recomendada):
- ✅ **UI**: Exibir "Promo: -R$20 (20% desc.)" no item
- ✅ **Detalhes**: Ao clicar, mostrar nome da promo ("Black Friday 2026")
- ✅ **Configurabilidade**: Operador pode remover promo aplicada (se autorizado)

**Owner**: Frontend  
**Target Resolução**: Antes de Fase 3 (UI design)  
**Status**: 🟢 **Planejado (UI spec em construção)**

---

### RISCO P2-03: Desconto de Gerente + Promoção = Confuso (Qual Vence?) ℹ️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟡 P2 (Médio) |
| **Probabilidade** | 🟠 **Alta** (70%) |
| **Impacto** | 🟡 **Médio** — Confusão operacional |
| **Detecção** | 🟠 Manual (observação) |
| **Janela Temporal** | 📍 **Fase 4** (E2E) |

**Descrição**:
Operador não entende como descontos se acumulam. Se produto tem -20% promo E gerente quer dar -10% global:
- Esperado: (100 - 20%) - 10% = 72
- Mas operador pode pensar: max(20%, 10%) = 90

**Causa Raiz**:
- Sem documentação de precedência
- UI não mostra breakdown de descontos
- RPC é autoridade, mas operador não sabe

**Cenário de Falha**:
1. Produto: R$100, promo -20% = R$80
2. Gerente autoriza -10% global (think: total -30%)
3. Operador espera: R$70
4. RPC aplica: (100 - 20%) - 10% = R$72
5. Cliente vê R$72, operador esperava R$70
6. ❌ Discrepância, operador "inventou" desconto não autorizado

**Impacto Negócio**:
- Fricção operacional
- Desconto não autorizado concedido

**Mitigação** (Recomendada):
- ✅ **Documentação**: Publicar regra de acumulação (promoção + manual + gerente)
- ✅ **UI Breakdown**: Mostrar: Preço Original (R$100) → Promo (R$80) → Gerente (R$72)
- ✅ **Treinamento**: Operador entende sequência

**Owner**: UX + Treinamento  
**Target Resolução**: Antes de Fase 4 (E2E)  
**Status**: 🟢 **Planejado (educação)**

---

### RISCO P2-04: Promoção Categoria Versus Específica (Precedência) ℹ️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟡 P2 (Médio) |
| **Probabilidade** | 🟠 **Média** (50%) |
| **Impacto** | 🟡 **Médio** — Configuração conflitante |
| **Detecção** | 🟠 Manual (relatório) |
| **Janela Temporal** | 📍 **Fase 4** (E2E) |

**Descrição**:
Se há promo de categoria ("Eletrônicos -15%") E promo específica do produto ("Samsung TV -25%"), qual vence?

**Cenário**:
- Categoria: Eletrônicos -15%
- Produto: Samsung 65" TV -25%
- Item: Samsung 65" TV

**Esperado**: -25% (específica vence)  
**Risco**: Implementação aplica -15% (genérica)

**Causa Raiz**:
- RPC `buscar_promocoes_ativas` retorna só 1 regra (LIMIT 1)
- Query precisa ordenar por precedência (produto > categoria)

**Cenário de Falha**:
1. Setup: promo categoria ELETRÔNICOS -15%, promo produto TV -25%
2. Query sem ORDER BY correto retorna categoria -15%
3. Produto é desconto com -15% (deveria ser -25%)
4. ❌ Cliente paga mais do que deveria

**Impacto Negócio**:
- Cliente insatisfeito
- Marketing: promo não é honrada

**Mitigação** (Obrigatória):
- ✅ **RPC Query**: ORDER BY tipo_regra DESC (PRODUTO antes de CATEGORIA)
- ✅ **Testing**: E2E testa precedência (teste #5 em BL-2)

**Owner**: Backend  
**Target Resolução**: Antes de Fase 2 (RPC implementation)  
**Status**: 🟡 **Em Planejamento (query drafted)**

---

### RISCO P2-05: Compatibilidade Backward — Vendas Antigas sem `regra_aplicada_id` ℹ️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟡 P2 (Médio) |
| **Probabilidade** | 🔴 **Certo** (100%) — dados históricos |
| **Impacto** | 🟡 **Médio** — Auditoria histórica |
| **Detecção** | 🟢 Automática (query) |
| **Janela Temporal** | 📍 **Fase 1** (schema) |

**Descrição**:
Após migration 273, coluna `regra_aplicada_id` é NULL para todas as vendas antigas (pré-BL-2). Relatórios que usam essa coluna mostram "promoção desconhecida" para vendas históricas.

**Causa Raiz**:
- Novo schema, dados antigos não têm info
- Sem backfill de dados

**Cenário de Falha**:
1. Migration 273 adiciona coluna `regra_aplicada_id` (default NULL)
2. Vendas antigos têm NULL
3. Relatório: "100% vendas com promo desconhecida" (historicamente)
4. ❌ Métrica é enganosa

**Impacto Negócio**:
- Relatórios históricos quebrados
- Análise de ROI de promo torna-se inválida

**Mitigação** (Recomendada):
- ✅ **Backfill** (opcional): Se vendas antigas tinham promo, atualizar com regra_id
- ✅ **Documentação**: Explicar que dados pré-BL-2 têm NULL
- ✅ **Query**: Usar `COALESCE(regra_aplicada_id, 'histórico')` em relatórios

**Owner**: Backend + Data  
**Target Resolução**: Antes de Fase 5 (dados)  
**Status**: 🟢 **Aceitável (NULL é explicável)**

---

### RISCO P2-06: Promoção Não Pode Ser "Deletada" (Apenas Desativada) ℹ️

| Campo | Valor |
|-------|-------|
| **Severidade** | 🟡 P2 (Médio) |
| **Probabilidade** | 🟠 **Alta** (70%) — usuario quer deletar |
| **Impacto** | 🟡 **Médio** — UX |
| **Detecção** | 🟢 Manual (observação) |
| **Janela Temporal** | 📍 **Fase 3** (Admin UI) |

**Descrição**:
Ao gerenciar promoções, admin espera poder deletar (DROP) uma regra. Mas deletar quebraria auditoria (FK referência em `itens_venda.regra_aplicada_id`). Sistema força "desativar" (ativo=false) em vez de deletar.

**Causa Raiz**:
- `regra_aplicada_id` é FK para `regras_preco`
- Sem cascade delete (ON DELETE SET NULL é mais seguro)
- UX não deixa claro

**Cenário de Falha**:
1. Admin tenta deletar promo "Black Friday 2026"
2. Sistema retorna erro: "Não é possível deletar (auditoria vinculada)"
3. Admin não entende (UI não explica)
4. Admin tenta forçar via SQL
5. ❌ Quebra integridade

**Impacto Negócio**:
- UX confuso
- Risco de data corruption se admin tentar workaround

**Mitigação** (Recomendada):
- ✅ **UI**: "Deletar" na verdade chama desativar (ativo=false)
- ✅ **Mensagem**: "Promoção será desativada (dados históricos preservados)"
- ✅ **FK Policy**: ON DELETE SET NULL (já aplicado em migration 273)

**Owner**: Frontend  
**Target Resolução**: Antes de Fase 3 (Admin UI)  
**Status**: 🟢 **Mitigação Simples (UI)**

---

## Matriz Consolidada

| # | Risco | Sev | Prob | Impacto | Gating | Mitigação | Owner | Status |
|---|-------|-----|------|---------|--------|-----------|-------|--------|
| P0-01 | Schema PROMOCAO | 🔴 | 🔴 Certo | 🔴 Crítico | ❌ Bloqueador | Migration 273 | Backend | 🟡 Planned |
| P0-02 | Duplicação Lógica | 🔴 | 🟠 Alta | 🔴 Crítico | ❌ Bloqueador | SSOT enforcement | Arch | 🟡 Discuss |
| P0-03 | Limite Desconto | 🔴 | 🟠 Média | 🔴 Crítico | ❌ Bloqueador | Config + RPC | Backend | 🟡 Planned |
| P1-01 | Concorrência | 🟠 | 🟠 Média | 🟠 Alto | ⚠️ Crítico | Epsilon + logging | Backend | 🟡 Discuss |
| P1-02 | Auditoria Inc. | 🟠 | 🔴 Certo | 🟠 Alto | ⚠️ Crítico | Obrigação RPC | Backend | 🟡 Planned |
| P1-03 | Promo Expirada | 🟠 | 🟠 Média | 🟠 Alto | ⚠️ Crítico | Epsilon temporal | Backend | 🟡 Discuss |
| P1-04 | Limite Item | 🟠 | 🟠 Média | 🟠 Alto | ⚠️ Crítico | Config + validação | Backend | 🟡 Discuss |
| P1-05 | Performance | 🟠 | 🟠 Média | 🟠 Alto | ⚠️ Crítico | Índices + cache | Backend | 🟡 Planned |
| P2-01 | Offline SSOT | 🟡 | 🟠 Média | 🟡 Médio | ℹ️ Monitor | Versioning | Backend | 🟢 Accept |
| P2-02 | UI Clarity | 🟡 | 🔴 Certo | 🟡 Médio | ℹ️ Monitor | UI design | Frontend | 🟢 Planned |
| P2-03 | Desconto Confuso | 🟡 | 🟠 Alta | 🟡 Médio | ℹ️ Monitor | Educação + UI | UX | 🟢 Planned |
| P2-04 | Precedência | 🟡 | 🟠 Média | 🟡 Médio | ℹ️ Monitor | Query ORDER BY | Backend | 🟡 Planned |
| P2-05 | Backward Compat | 🟡 | 🔴 Certo | 🟡 Médio | ℹ️ Monitor | Backfill opção | Data | 🟢 Accept |
| P2-06 | Delete UX | 🟡 | 🟠 Alta | 🟡 Médio | ℹ️ Monitor | UI clarity | Frontend | 🟢 Simple |

---

## Roadmap de Mitigação (Por Fase)

### Fase 0 (Bloqueador)
- ✅ **P0-01**: Migration 273 (schema)
- ⚠️ **P0-02**: Decisão de arquitetura (SSOT enforcement)
- ⚠️ **P0-03**: Config + RPC skeleton (implementar em Fase 2)

### Fase 1-2 (Schema + RPC)
- ✅ **P0-01**: Validação schema
- ✅ **P0-03**: RPC validação limite desconto
- ✅ **P1-02**: RPC popula obrigatoriamente regra_id
- ✅ **P1-04**: Validação item limit (ou decisão de exclusão)
- ✅ **P1-05**: Índices (migration 273)
- ✅ **P2-04**: RPC ORDER BY precedência

### Fase 3-4 (Frontend + E2E)
- ✅ **P1-03**: Epsilon temporal (RPC + logging)
- ✅ **P1-01**: Concorrência (tolerância)
- ✅ **P2-02**: UI exibe desconto
- ✅ **P2-03**: Documentação breakdown descontos
- ✅ **P2-06**: UI "deletar" = desativar
- ✅ **E2E #5**: Precedência categoria vs produto

### Fase 5 (Staging + Produção)
- ✅ **P2-01**: Offline versioning (optional)
- ✅ **P2-05**: Backfill histórico (optional)
- ✅ **P1-05**: APM monitoring (performance)

---

## Gating de Go-Live

**BL-2 só vai para produção se**:

✅ **Todos P0 mitigados** (bloqueadores)  
✅ **Todos P1 com mitigação aprovada** (críticos)  
✅ **Todos P2 com plano** (médios)  
✅ **E2E 15+ testes passam** (incluindo riscos)  
✅ **Staging stable por 3+ dias** (sem regressions)  
✅ **Aprovação executiva** (negócio + técnica)  

---

## Conclusão

BL-2 tem **3 bloqueadores críticos** que devem ser mitigados na Fase 0 antes de qualquer implementação. Com as mitigações recomendadas, risco geral reduz de **ALTO** para **MÉDIO-BAIXO**. Roadmap de implementação faseado garante que riscos são endereçados gradualmente.

**Próxima Ação**: Aprovação desta matriz → Iniciar Fase 0.

---

**Data**: 2026-07-24  
**Status**: 🚨 Análise Completa  
**Autor**: Claude (claude-haiku-4-5-20251001)  
**Referência**: BL2_ANALISE_INICIAL.md + BL2_PLANO_IMPLEMENTACAO.md
