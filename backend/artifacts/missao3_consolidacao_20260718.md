# Missão 3 — Relatório de consolidação

**Data:** 2026-07-18  
**Branch:** `consolidate/missao3-20260718`  
**Base:** `origin/main` @ `ebbeac5c` (DragonModal /caixa)  
**Critério desta fase:** estabilizar consolidação e validar fluxo operacional cadastro → venda → estoque.

---

## Veredito de consolidação (código)

Branch **candidata a merge** após limpeza de processo (gitignore) e teste operacional 3.1.

Não abrir PR até o teste operacional 3.1 passar (decisão de arquiteto).

---

## Commits na branch (vs `origin/main`)

| Commit | Escopo |
|---|---|
| `82997f21` | fix(caixa): PDV + cadastro relâmpago |
| `c6fca72d` | feat(produtos): estoque inicial atômico + sugestão GTIN |
| `4290c78f` | feat(db): migrations PDV / estoque inicial / GTIN cache |
| `0a6ddb7d` | test: cadastro/estoque inicial, GTIN, fluxos caixa |
| `4b0af622` | docs: go/no-go Missão 1/3 + caixas órfãos |
| `2e53327f` | chore: env examples, deps SSR/server, seed E2E |
| *(este ciclo)* | chore: ignore WIP artifacts; docs consolidação |

---

## Alterações aprovadas

### Cadastro Produto

| Capacidade | Estado | Notas |
|---|---|---|
| Duplicação de produto | OK | `duplicarDe` no catálogo + form |
| Código de barras inicial | OK | prop `codigoBarrasInicial` (PDV → modal) |
| GTIN / sugestão | OK | adapters + cache; typecheck mapeia fontes |
| Categoria rápida | OK | `CategoriaQuickField` sempre visível |
| Estoque inicial atômico | OK | RPC `criar_produto_com_estoque_inicial` |

### Estoque

| Capacidade | Estado | Notas |
|---|---|---|
| Ajuste manual com ator | OK | `p_ator_id` + guard `AJUSTE_ESTOQUE_AUTH` |
| Tratamento de erro | OK | try/catch admin client + `mensagemErroAjusteEstoqueManual` |
| RPC como fonte oficial | OK | sem 2º round-trip parcial no modal de create |

### UX (congelado neste ciclo)

| Tema | Decisão |
|---|---|
| CTA criar produto | **Não alterar agora** — permanece “Salvar produto” no create |
| Teclado | Mantido (`acaoTecladoProduto`) |
| Status chip / publicação | Helpers `statusPublicacao` do main + chip Missão 1 |

Discussão CTA/publicação **adiada** (Opção A vs B). Não inventar workflow de publicação neste ciclo.

---

## Decisões arquiteturais

### 1. Estoque inicial permanece via RPC transacional

**Decisão:** create com saldo inicial só por `criar_produto_com_estoque_inicial` (mesma TX: produto + estoque + kardex opcional).

**Não reintroduzir** o path legado `aplicarEstoqueInicial` → `atualizarEstoqueProduto` no modal de create.

**Alinhamento Jinlong:**

- regra crítica no backend  
- uma fonte de verdade  
- menos risco de divergência React/TS/Postgres  

### 2. Preço na venda continua RPC

Autoridade de preço na venda: `calcular_preco_produto` (+ revalidação no commit). Cadastro grava preços no master data; não duplica regra de atacado no React.

### 3. SSoT de entidade

Produto oficial em `/admin/catalogo`. PDV relâmpago permitido (OPERADOR+) só para mínimo + estoque inicial via mesma RPC. Pós-criação de saldo → `/admin/estoque`.

---

## Limpeza de processo (WIP)

| Item | Ação |
|---|---|
| Logs E2E / smoke / homolog `backend/artifacts/*.txt` | **Ignorados** via `.gitignore` (não entram em commits futuros) |
| Experimentais `268_*`, `patch_*.sql`, `_split_*.py` | Ignorados |
| `docs/quarantine/` | Ignorado |
| Relatórios go/no-go `*.md` | **Mantidos** (evidência) |

Remoção física dos arquivos locais já ignorados: opcional (`git clean -Xf -- backend/artifacts`). Não bloqueia merge.

---

## Teste operacional 3.1 (plano)

Fluxo de negócio (não unitário):

1. **Cadastro** — Produto A: código barras, varejo, atacado, categoria, estoque inicial = 10  
2. **Validar** — produto criado, estoque = 10, histórico/movimentação  
3. **PDV** — buscar → carrinho → finalizar  
4. **Validar** — baixa estoque, venda, pagamento  
5. **Pós-venda** — estoque, venda, auditoria/movimentação  

Resultado: ver seção anexada após execução (ou artefato `missao3_ops_3_1_*.md` / SQL log).

---

## Próximo (após 3.1 GO)

```
Missão 3 cadastro  →  Teste 3.1  →  Missão 4 (Venda→Estoque→Financeiro)
                                  →  Missão 5 (Auditoria/permissões)
                                  →  Go Live
```

**Não** adicionar features até PDV + Produtos + Estoque + Financeiro estarem completos no sentido operacional.

**Não** abrir gestão de funcionários antes de permissões (já registrado no go/no-go).

---

## Riscos residuais conhecidos (não bloquear consolidação de código)

| ID | Risco | Severidade |
|---|---|---|
| R-UX | CTA create vs publicar — decisão de produto pendente | P2 |
| R-AUD | Sem ledger de alteração de preço no master data | P0 go-live completo |
| R-CAIXA | Fechamento sem conferência PIX/cartão | P0 se exigir tender full |
| R-ROLE | Modelo 4 perfis ≠ 6 papéis da especificação | P0 se multi-função |
