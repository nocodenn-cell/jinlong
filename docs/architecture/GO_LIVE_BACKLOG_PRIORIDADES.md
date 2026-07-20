# Backlog priorizado — pós-War Room / 1º cliente

| Campo | Valor |
|--------|--------|
| **Data** | 2026-07-19 |
| **Modo atual** | **War Room** — só P0 da homologação |
| **Aceite** | [GO_LIVE_ACEITE.md](./GO_LIVE_ACEITE.md) |
| **PR** | [#220](https://github.com/nocodenn-cell/fastproduct/pull/220) |

> Este doc **congela a ordem de valor** depois do Go-Live.  
> Durante a War Room: **não** executar P2–P9; P1 só se for fatia mínima que desbloqueie evidência do aceite.

---

## Explicitamente FORA agora

- Novo Design System / trocar componentes / refazer layouts  
- Reorganizar pastas / migrar tecnologias  
- Dashboards sofisticados / expandir Decision Intelligence  
- Qualquer item abaixo marcado **PARK** enquanto houver P0 de homologação  

---

## Prioridade 1 — Implantação (centro de comando Go-Live)

| Capacidade | Estado | Onde |
|------------|--------|------|
| Checklist persistido | **EXISTS** | `implantacao_checklists` / `_itens` + UI |
| Responsável por etapa | **EXISTS** | coluna `responsavel` + input na UI |
| Botão Autorizar Go-Live | **EXISTS** | `autorizarGoLiveAction` (DONO/ADMIN) |
| Revogar GO | **EXISTS** | `revogarGoLiveAction` |
| Observações por item | **EXISTS** | `observacoes` |
| Validar dados (P0-DADOS) | **EXISTS** | botão + `homologacao.dados` |
| Evidências (print/log/anexo) | **GAP** | só em markdown ACEITE — sem storage na UI |
| Timeline de validações | **GAP** | sem evento/`concluido_em` agregado em UI timeline |
| Histórico de homologações | **GAP** | sem log de execuções #1/#2 do roteiro |

**Fatia mínima alinhada ao War Room (se autorizada):**  
persistir evidência textual + link/ID por item + painel “histórico de execuções” (2× consecutivas) — **sem** upload de arquivo se isso exigir migration/storage nova sob pressão.

---

## Prioridade 2 — Dashboard operacional (diário)

| Capacidade | Estado |
|------------|--------|
| Cockpit “Hoje” (caixas, vendas, PIX, vencimentos, estoque crítico, alertas, pendências) | **PARK** — não é DI; pós-Go-Live |

---

## Prioridade 3 — Caixa UX

| Capacidade | Estado |
|------------|--------|
| Busca rápida, teclado 100%, atalhos, confirmação visual, resumo, indicadores, loading zero | **PARK** — UX pós-homologação; bugs P0 do caixa entram na War Room |

---

## Prioridade 4 — Cadastro

| Área | Estado |
|------|--------|
| Produtos (rápido, fotos, preços, estoque, fornecedor, fiscal, histórico) | **PARK** (CRUD base EXISTS em `/admin/catalogo`) |
| Clientes (compras, crédito, documentos) | **PARK** (CRUD base EXISTS) |
| Funcionários (permissões, caixas, auditoria) | **PARK** (CRUD base EXISTS em `/admin/funcionarios`) |

---

## Prioridade 5 — Estoque avançado

| Capacidade | Estado |
|------------|--------|
| Kardex cronológico unificado | **PARK** (há kardex/ajuste/recebimento; unificar UX depois) |
| Movimentações com filtros ricos | **PARK** |
| Inventário (contagem, diferenças, responsável) | **PARK** |

---

## Prioridade 6 — Financeiro UX

| Capacidade | Estado |
|------------|--------|
| Receber / Pagar | **EXISTS** (abas) |
| Fluxo de caixa, calendário, inadimplência, conciliação | **PARK** |

---

## Prioridade 7 — Fiscal (mesmo Stub)

| Capacidade | Estado |
|------------|--------|
| Fila + status + detalhe + reprocessar | **EXISTS** |
| Histórico rico / rejeições / botão emitir / motivo | **PARK** (emitir real = pós-Stub) |

---

## Prioridade 8 — Relatórios

| Capacidade | Estado |
|------------|--------|
| Vendas, margem, caixa, estoque, financeiro, export PDF/Excel | **PARK** (há relatórios base; completar depois) |

---

## Prioridade 9 — Configurações

| Capacidade | Estado |
|------------|--------|
| Empresa, loja, usuários, impressora, PIX, NFC-e, backup, parâmetros | **PARK** (há `/admin/configuracoes`; completar depois) |

---

## Ordem de execução recomendada

```
War Room (ACEITE 2× + zero P0)
    ↓
P1 gaps Implantação (evidência + timeline + histórico execuções)
    ↓
P3 Caixa UX (operador diário)
    ↓
P2 Dashboard operacional
    ↓
P5 Estoque inventário/kardex
    ↓
P6 Financeiro UX
    ↓
P4 Cadastro profundidade
    ↓
P7 Fiscal além do Stub (quando produto autorizar)
    ↓
P8 Relatórios
    ↓
P9 Configurações
```

Decision Intelligence continua **congelada** em paralelo — não compete com esta fila.
