# P4: Padronização de Nomenclatura de Menu

**Bloqueador Crítico** — Gerente novo não sabe onde clicar
**Status:** Recomendação de estrutura

## Problema

Menu atual tem nomes que causam confusão:
- ❌ "Catálogo" vs "Produtos" — qual é qual?
- ❌ "Vendas" vs "Relatórios" — qual é qual?
- ❌ Estrutura não reflete o workflow real de um gerente

## Solução Proposta

### Estrutura de Menu Padronizada

```
┌─────────────────────────────────────────┐
│ JINLONG ERP — GERENTE                   │
└─────────────────────────────────────────┘

👤 DASHBOARD
├─ Dashboard                (visão do dia)
└─ Relatórios              (análises, gráficos)

🏪 OPERAÇÕES DIÁRIAS
├─ Caixa                   (abrir/fechar, movimentações)
├─ Vendas                  (histórico de vendas)
└─ Auditoria               (log de ações)

📦 CATÁLOGO & ESTOQUE
├─ Produtos                (gerenciar produtos) ← não "Catálogo"
├─ Categorias
├─ Estoque                 (saldos, movimentação)
├─ Recebimento             (entrada de mercadoria)
└─ Fornecedores

💰 FINANCEIRO
├─ Financeiro              (contas a receber + fila fiscal)
├─ Contas a Pagar
└─ Comissões               (se aplicável)

⚙️ ADMINISTRATIVO
├─ Configurações
└─ Suspensões              (se aplicável)
```

## Mapeamento: Paths → Labels

| Path | Label Atual | Label Proposto | Motivo |
|------|-------------|----------------|--------|
| `/admin/catalogo` | "Catálogo" | **"Produtos"** | Operador entende "Produtos". "Catálogo" é termo técnico. |
| `/admin/vendas` | "Vendas" | **"Vendas"** | OK, manter. |
| `/admin/relatorios` | "Relatórios" | **"Relatórios"** | OK, manter. |
| `/admin/estoque` | "Estoque" | **"Estoque"** | OK, manter. |
| `/admin/compras` | "Compras" | **"Compras"** | OK, manter (aparentemente OK para gerente). |
| `/admin/financeiro` | "Financeiro" | **"Financeiro"** | OK, manter. |
| `/admin/configuracoes` | "Configurações" | **"Configurações"** | OK, manter. |
| `/admin/auditoria` | "Auditoria" | **"Auditoria"** | Técnico, mas válido. Manter. |
| `/admin/dashboard` | "Dashboard" | **"Dashboard"** | OK, manter. |

## Implementação

### Checklist

- [ ] **Revisar arquivo de labels/i18n**
  - Procurar por `catalogo_titulo`, `catalogo_label`, etc em arquivos de mensagens
  - Mudar label público de "Catálogo" → "Produtos"
  - Manter paths iguais (apenas label muda)

- [ ] **Validar em interface**
  - Gerente novo consegue achar "Produtos"? ✅
  - Estrutura segue workflow: Dashboard → Operações → Catálogo → Financeiro → Admin? ✅

- [ ] **Teste com usuário real**
  - Simulação: "Onde você clicaria para adicionar um novo produto?"
  - Resposta esperada: "Produtos" não "Catálogo"

## Próximo Passo

P4 não requer mudança de código — apenas revisar labels nas mensagens i18n.
