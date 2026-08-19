# ⚠️ `Jinlong/` — wiki histórica, **não** é estado atual

**Marcado como histórico em:** 2026-08-13
**Último commit que tocou esta árvore:** `4d7d9b9` (2026-07-31)

> Esta pasta é um **registro histórico** do projeto. **Não use nenhum arquivo daqui para decidir o
> estado atual do sistema.** Vários afirmam pendências já resolvidas e métricas já desatualizadas.

A árvore não é atualizada desde **2026-07-31** e, portanto, é anterior a toda a trilha P0 de
integração Go-Live (PRs #282–#287, 2026-08-09) e ao fechamento de UI/UX pós-S7.

---

## Onde está a verdade

| Assunto | Fonte vigente |
|---|---|
| Estado de release / Go-Live | `GO_LIVE_CERTIFICATION_REPORT.md`, `docs/GO_LIVE_STATUS_FINAL.md` |
| Arquitetura e fronteiras | `docs/adr/` (ADR-005…011) |
| Contratos de RPC | `docs/contracts/v1/` |
| Autorização / RLS | `docs/AUTHORIZATION_MATRIX.md` |
| SSOT de migrations | `docs/adr/ADR-011-ssot-unico-migrations.md` |
| `venda_finance_context` | `docs/RECONCILIACAO_venda_finance_context_2026-08-13.md` |
| Governança ativa de execução | `.cursor/rules/*.mdc` |

## Divergências verificadas contra o código (2026-08-13)

Amostra comprovada — não é lista exaustiva:

| Arquivo | Afirma | Realidade verificada |
|---|---|---|
| `02_ESTADO_ATUAL.md:92` | "Conflito migration 255": dois arquivos `255_` | **Não existe.** Migrations foram para timestamp; `guard:migrations` exit 0, allowlist de colisões vazio |
| `02_ESTADO_ATUAL.md:131` | "Migrations SQL: 187 arquivos" | **270** arquivos |
| `02_ESTADO_ATUAL.md:64` | "Observabilidade (Sentry/APM): não encontrado no código" | **Existe**: `sentry.edge.config.js`, `sentry.server.config.js`, `instrumentation-client.js` na raiz |
| `02_ESTADO_ATUAL.md:57`, `Bugs.md:37`, `Roadmap.md:69`, `06_ROADMAP.md:70`, `08_PROBLEMAS_E_SOLUCOES.md:77`, `Backlog.md:44` | Devolução/troca pendente; `048_devolucoes.sql` incompleto | **Implementada e aplicada em produção.** `20260717031500_248_devolver_ou_trocar_venda.sql` define a RPC única (idempotente, cobre estoque/devoluções/caixa/AR/kardex/ledger), consta em `prod_migrations.tsv`, e a cadeia UI→action→impl→RPC está coberta por `pdv-importados/tests/devolucao-troca-cadeia.test.ts` |
| `Changelog.md:216`, `01_HISTORICO_PROJETO.md:15` | RPC canônica **v2** | Canônica é a **v4** (22 args, scope-guard) — ver `docs/contracts/v1/rpc-finalizar-venda-canonica-v4.json` |

## Itens daqui que continuam válidos

Nem tudo está errado. `Dívida Técnica.md` acerta ao registrar que a v2/v3 estão bloqueadas para
`authenticated` e que o desktop usa RPC legada (`registrar_venda_com_itens`) — esta última
permanece como divergência real, registrada em `docs/CIRCUITO_OPERACIONAL.md` §1.

`Bugs.md` acerta ao apontar que o ADR do pipeline de bip está `Proposto` com a implementação já em
produção — pendência real, ainda aberta.

## Por que não foi movida para `docs/archive/`

Mover 28 arquivos quebraria os links `[[wikilink]]` internos entre eles, que é o formato desta
wiki. O custo de manutenção supera o ganho. Este README cumpre a função: quem chegar aqui sabe que
está lendo história.
