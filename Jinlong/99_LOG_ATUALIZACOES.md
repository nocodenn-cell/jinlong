# 99 — Log de Atualizações

> Diário permanente de mudanças na documentação e no projeto.
> Formato: Data · Mudança · Motivo · Arquivos · Commit · Impacto
> [[00_DASHBOARD_PROJETO]] · [[01_HISTORICO_PROJETO]]

---

## 2026-07-30 — Limpeza de navegação: produto × ferramenta interna ✅ CONCLUÍDA

| Campo | Valor |
|---|---|
| **Mudança** | Auditoria de exposição do menu lateral + execução das ondas 1–3 |
| **Motivo** | Menu do cliente misturava produto real com ferramentas de implantação/diagnóstico do fornecedor — e, ao mesmo tempo, escondia cadastros essenciais |
| **Arquivos** | `lib/navigation/adminV2SidebarNav.ts` (único de produção) + 2 arquivos de teste + `AUDITORIA_MENU_EXPOSICAO_CLIENTE.md` |
| **Commit** | `4d12438d` · PR [#239](https://github.com/nocodenn-cell/fastproduct/pull/239) |
| **Impacto** | Cliente deixa de ver 2 ferramentas internas e passa a alcançar 2 cadastros que estavam inacessíveis |

**Quatro correções:**
1. **Fluxo quebrado destravado** — `/admin/categorias-produtos` e `/admin/categorias-financeiras` eram rotas completas com CRUD **sem nenhum link na UI**. O cliente não conseguia criar categoria de produto pela interface. Produtos entrou no CORE, financeiras em "Mais".
2. **Ferramentas internas escondidas** — `Implantação / GO-LIVE` e `Diagnóstico do Caixa` passam a `adminOnly` (mesmo mecanismo já usado por `Provisionamento`). Expunham `service_role`, storage, nomes de migration/RPC e GRANTs a qualquer GERENTE.
3. **Nomenclatura** — "Suspensão de licença" → "Suspensão de vendas" (o dicionário i18n já estava certo; o `labelOverridePt` é que introduzia o termo errado).
4. **Tarefas diárias** — `Recebimento` e `Relatórios` subiram da gaveta "Mais" (recolhida por padrão) para o CORE.

**Escopo deliberadamente limitado:** rotas e policies **não** foram alteradas — mudança de *exposição*, não de *autorização*. As rotas internas continuam acessíveis por URL a DONO/GERENTE. Fechar isso é a onda 4 (ver §8.7 da auditoria).

**Verificação:** typecheck limpo · 155 arquivos / 815 testes verdes · eslint limpo · `check:golive` verde · build de produção OK · 18 testes novos, incluindo render do `SidebarNav` em jsdom por perfil.

---

## 2026-07-10 — Reestruturação Home MD como Central Obsidian

| Campo | Valor |
|---|---|
| **Mudança** | Auditoria completa da pasta `Jinlong/` e criação de estrutura numerada 00–09 + 99 |
| **Motivo** | Transformar documentação dispersa em painel de comando permanente para Obsidian |
| **Arquivos criados** | `00_DASHBOARD_PROJETO.md`, `01_HISTORICO_PROJETO.md`, `02_ESTADO_ATUAL.md`, `03_ARQUITETURA.md`, `04_PDV.md`, `05_CADASTRO_PRODUTO.md`, `06_ROADMAP.md`, `07_DECISOES_ARQUITETURAIS.md`, `08_PROBLEMAS_E_SOLUCOES.md`, `09_OPERACAO_PRIMEIRO_CLIENTE.md`, `99_LOG_ATUALIZACOES.md` |
| **Arquivos modificados** | `Home.md` (hub navegável), banners legado nos arquivos antigos |
| **Commit** | `f2fca536` (parcial — docs Jinlong no mesmo commit de fixes admin) |
| **Impacto** | Memória permanente navegável; correção de 4 discrepâncias docs vs código |

**Discrepâncias corrigidas na auditoria:**
1. Contas a pagar: de "em andamento" → implementado em `/admin/financeiro?tab=pagar`
2. Venda em espera: de "inexistente" → parcial (migration `255` + código + E2E)
3. Migration `255`: documentado conflito de dois arquivos no repo
4. HEAD atualizado: `f2fca536` (não apenas `5ce33a6d`)

---

## 2026-07-10 — Diagnóstico pré-produção PDV

| Campo | Valor |
|---|---|
| **Mudança** | Ferramenta de checklist antes do 1º cliente |
| **Motivo** | Gate operacional para validar ambiente alvo |
| **Arquivos** | `256_pdv_diagnostico_pre_producao.sql`, `/admin/diagnostico-caixa`, `check:caixa-pre-producao`, `verify_p0_producao.sql` |
| **Commit** | `5ce33a6d` |
| **Impacto** | Admin pode verificar OK/FALHA/AVISO antes do go-live |

---

## 2026-07-10 — Fix merge VendasTable + typecheck diagnóstico

| Campo | Valor |
|---|---|
| **Mudança** | Resolução conflito merge; guard typecheck `diagnosticoCaixa.impl.ts` |
| **Motivo** | Build quebrado após merge admin consolidation |
| **Arquivos** | `VendasTable.tsx`, `diagnosticoCaixa.impl.ts`, docs Jinlong |
| **Commit** | `f2fca536` |
| **Impacto** | Cancelamento vendas admin funcional; typecheck verde |

---

## 2026-07-09 — Consolidação admin + SSoT entidades

| Campo | Valor |
|---|---|
| **Mudança** | Telas admin consolidadas; enforcement SSoT produto/cliente/estoque |
| **Motivo** | Eliminar CRUD duplicado; governança de dados |
| **Arquivos** | `app/admin/*`, `entity-ssot.mdc` |
| **Commit** | `88f2e64a` |
| **Impacto** | Fonte única de cadastros; vendas admin com `VendaDetailSheet` |

---

## 2026-07-08 — Feature Freeze + Governança PMO

| Campo | Valor |
|---|---|
| **Mudança** | Freeze formal de features; auditoria PMO completa |
| **Motivo** | Foco no piloto 1º cliente pagante |
| **Arquivos** | `docs/FEATURE_FREEZE_PILOTO.md`, `docs/GOVERNANCA_PMO_JINLONG.md` |
| **Commit** | (documentação — sem commit único identificado) |
| **Impacto** | Canal D0 = web; fiscal mock; sem features novas |

---

## 2026-06 — RPC canônica v4 + bloqueio legadas

| Campo | Valor |
|---|---|
| **Mudança** | v4 como padrão; v2/v3 bloqueadas |
| **Motivo** | Inconsistências em finalização de venda |
| **Arquivos** | `migrations/243`, `20260619…`, `20260620…` |
| **Impacto** | Ponto único de auditoria para vendas |

---

## 2026-06 — GRANT baseline capturado

| Campo | Valor |
|---|---|
| **Mudança** | GRANTs versionados em migration |
| **Motivo** | Drift: grants aplicados manualmente no dashboard Supabase |
| **Arquivos** | `255_grant_baseline_tabelas_authenticated.sql` |
| **Impacto** | Ambientes novos recebem grants corretos (se migration aplicada) |

---

## Template para Novas Entradas

```markdown
## YYYY-MM-DD — Título curto

| Campo | Valor |
|---|---|
| **Mudança** | O que mudou |
| **Motivo** | Por que mudou |
| **Arquivos** | Lista de arquivos afetados |
| **Commit** | `hash` — mensagem |
| **Impacto** | Efeito no projeto/operacao |
```

---

> Histórico completo: [[01_HISTORICO_PROJETO]] · Changelog legado: [[Changelog]]
