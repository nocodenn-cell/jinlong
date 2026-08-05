# Auditoria Go-Live — Índice

Documentos de auditoria do Jīn Lóng ERP, gerados por Hermes (análise somente-leitura,
evidência de banco). Nenhum dado foi alterado pelas auditorias.

> ## ⚠️ Esta pasta não define ordem de execução
>
> | Papel | Documento |
> |---|---|
> | **Fila única de execução** | `docs/GO_LIVE_IMPLEMENTATION_GUIDE.md` (Pacotes 0–6) |
> | **Autoridade normativa** (o que a regra é) | `docs/ARQUITETURA_REGRAS_NEGOCIO.md` v2.1 |
> | **Esta pasta** | **Evidência e detalhe de ticket** (como corrigir) |
>
> Em conflito entre uma auditoria daqui e uma ADR, **a ADR vence**: a série F1–F6.1 é de
> 2026-08-03 e antecede a aprovação das 7 ADRs (2026-08-04).
>
> **Namespace:** o prefixo `RN-XXX` pertence exclusivamente ao Cap. 7 da arquitetura.
> Os achados de regra desta pasta usam **`FRN-XX`** (renomeados em 2026-08-05).

## Frentes — série F (operacional, 2026-08-03)

Atenção aos caminhos: quatro destes arquivos vivem em `docs/`, não nesta pasta.

| Frente | Documento | Escopo |
|---|---|---|
| Funcional (telas) | `../AUDITORIA_FUNCIONAL_COMPLETA_GO_LIVE.md` | Cobertura de telas e fluxos |
| F1 — Parametrização | `../AUDITORIA_F1_PARAMETRIZACAO.md` | Lojas, impostos, formas de pagamento, permissões |
| F2 — Cadastros Inconsistentes (dados) | `AUDITORIA_F2_CADASTROS_GO_LIVE.md` | Produtos, clientes, fornecedores, funcionários + fila de tickets |
| F2UX — Cadastros Mestres (UX/A11y) | `../AUDITORIA_F2_CADASTROS_UX.md` | Usabilidade e acessibilidade das telas de cadastro |
| F2B — Cadastro de Produto (perfil DONO) | `../AUDITORIA_F2B_CADASTRO_PRODUTO.md` | Formulário de produto |
| F3 — Dados de Teste | `AUDITORIA_F3_DADOS_TESTE.md` | Limpeza de dados de teste misturados |
| F5 — Trilha Operacional | `AUDITORIA_F5_TRILHA.md` | **Event audit trail: o que é rastreado** |
| **F6 — Coerência Tela ↔ Backend** | **`AUDITORIA_F6_COHERENCIA_TELA_BACKEND.md`** | **Tela→Hook→Action→Tabela→Auditoria→Permissão** |
| F6.1 — Expansão Operacional | `AUDITORIA_F6_1_EXPANSAO_OPERACIONAL.md` | Estoque, Vendas Admin, Produto, Relatórios |
| Catálogo consolidado F1–F6.1 | `GO_LIVE_MASTER_FIX_PLAN.md` | 39 achados. **Não é fila de execução** (§§2 e 5 revogadas) |

## Rodadas v1 / v2 / v3 (arquiteturais, 2026-08-04) — base do conjunto R1

| Rodada | Índice | Conteúdo |
|---|---|---|
| v1 | `AUDITORIA_HERMES_TICKETS_CLAUDE_CODE.md` | SEC, DAT, FLX, BR, CA, TB-01 — `tickets_P0_*.md`, `tickets_P1_*.md` |
| v2 | `v2/00_INDICE_E_VEREDITOS.md` | SSOT-01..05, FLX-04 + 9 descartados |
| v3 | `v3/00_INDICE.md` | TB-02..TB-07 (Tela ↔ Backend) + 3 descartados |

Consolidação das três rodadas: **29 tickets** em `../ARQUITETURA_REGRAS_NEGOCIO.md` (Cap. 7 e 8),
`../ENCERRAMENTO_FASE_ARQUITETURA.md` e `../ARQUITETURA_R1_FREEZE.md`.

## Frente 6 — validação e tickets

- `AUDITORIA_F6_COHERENCIA_TELA_BACKEND.md` — achados de incoerência (campo órfão, rota fora da policy, ação sem auditoria, info ambígua).
- `tickets/GO_LIVE_TICKETS_F6_COHERENCIA.md` — 5 tickets (2 🔴 correção, 2 🟡 correção, 1 ⚪ validação).

## Frente 6.1 — Expansão Operacional (complemento)

- `AUDITORIA_F6_1_EXPANSAO_OPERACIONAL.md` — Estoque (maduro), Vendas Admin (KPI página parcial), Produto (campos opcionais consistentes), Relatórios (cálculo certo; risco de dado F3).
- `tickets/GO_LIVE_TICKETS_F6_1_EXPANSAO.md` — 4 tickets (2 🔴, 2 🟡).

## Frente 5 — validação e tickets

- **`PLANO_VALIDACAO_F5_RUNTIME.md`** — cenários de teste controlado para confirmar se
  cada evento grava trilha (separa falha comprovada de falta de validação).
- **`tickets/GO_LIVE_TICKETS_F5_TRILHA.md`** — fila de tickets **somente de validação**
  (15 itens). Nenhuma falha confirmada; zero tickets de correção nesta frente.

## Regras de Negócio + Cálculos (complemento)

- `AUDITORIA_REGRAS_NEGOCIO_GO_LIVE.md` — validação de regras (Venda/Produto/Estoque/Preços/Financeiro/Permissões) com classificação CONFIRMADO/RISCO/NÃO PROBLEMA/MELHORIA.
- `AUDITORIA_CALCULOS_GO_LIVE.md` — validação de fórmulas (Venda/Estoque/Financeiro/Margem/Comissões/Relatórios).
- `tickets/GO_LIVE_TICKETS_REGRAS_CALCULOS.md` — 6 tickets (3 🔴 P0 confirmados, 3 🟡 P1 risco/validação).

> **Reclassificações de 2026-08-05 nesta frente:** `RN-001`→**`FRN-01`** (rebaixado a P1 e
> reescopado por **ADR-002** — NCM bloqueia emissão, nunca publicação ou venda) ·
> `RN-002`→**`FRN-02`** · `RN-003`→**`FRN-03`**. Corrigido também o veredito falso
> *"sem regra de margem mínima encontrada"* — a regra existe (RN-008, 9 triggers, migs 124/125/126).

## Classificação usada na F5

| Símbolo | Significado |
|---|---|
| ✅ VALIDADO | Evento executado em runtime e evidência encontrada. |
| 🟡 PARCIAL | Evento executado, gerou trilha, mas faltam campos. |
| 🔴 FALHA CONFIRMADA | Evento executado e deveria gerar trilha, mas não gerou. |
| ⚪ NÃO VALIDADO | Tabela/fluxo existe, mas não houve operação suficiente para confirmar. |

## Filas de tickets (execução pelo Claude Code)

- `tickets/GO_LIVE_TICKETS_F2_CADASTROS.md` — Frente 2 (15 tickets: 1 bloqueador GL)
- `tickets/GO_LIVE_TICKETS_F5_TRILHA.md` — Frente 5 (15 tickets de validação)
- `tickets/GO_LIVE_TICKETS_F6_COHERENCIA.md` — Frente 6 (5 tickets)
- `tickets/GO_LIVE_TICKETS_F6_1_EXPANSAO.md` — Frente 6.1 (4 tickets)
- `tickets/GO_LIVE_TICKETS_REGRAS_CALCULOS.md` — Regras + Cálculos (6 tickets)
- F3 — limpeza: ver `AUDITORIA_F3_DADOS_TESTE.md` (plano em ordem de FK; aguarda aprovação)
