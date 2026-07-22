# 📊 Estatísticas do Projeto — Jīn Lóng

> ⚠️ **Arquivo legado** — conteúdo canônico em [[02_ESTADO_ATUAL]] (2026-07-10)
> [[Home]] | [[Arquitetura]]
> Última atualização: 2026-07-09

---

## Código

| Métrica | Quantidade | Observação |
|---|---|---|
| **Arquivos TypeScript/TSX total** | ~800+ | Incluindo todos os workspaces |
| **Componentes React** | ~142 | Arquivos em `components/**/*.tsx` |
| **Páginas (page.tsx)** | ~26 | Rotas do App Router |
| **Arquivos de teste** | 113 | `.test.ts`, `.test.tsx`, `.spec.ts`, `.spec.tsx` |
| **Hooks customizados (use*.ts/tsx)** | ~28 | Hooks em todos os workspaces |
| **Providers** | ~0 diretórios dedicados | Providers via React Context em componentes |
| **Clientes Supabase instanciados** | ~287 | Chamadas a `createClient`/`createServerClient` |

---

## Banco de Dados

| Métrica | Quantidade | Observação |
|---|---|---|
| **Migrations SQL** | 186 | Numeração 001–258 com lacunas propositais |
| **Tabelas principais** | ~20+ | Estimado; não foi possível confirmar o total exato |
| **RPCs (Stored Procedures)** | ~30+ | `finalizar_venda_*`, `decrementar_estoque_*`, `relatorio_*`, `fiscal_*`, etc. |
| **Edge Functions** | 3 | `sync-outbox`, `validar-gerente`, `fiscal-worker` |
| **Views** | 1+ confirmada | `v_kardex_unificado` (migration 060) |
| **Triggers** | 2+ | `guard_margem_negativa`, `kardex_vendas_imutavel` |

---

## Testes

| Métrica | Quantidade | Observação |
|---|---|---|
| **Arquivos de teste total** | 113 | Unitários + E2E |
| **Specs E2E (Playwright)** | ~6 | `caixa-venda`, `multi-pagamento`, `fluxos-criticos`, `gerente`, `sync-gerente`, `login` |
| **Testes unitários (Vitest)** | ~107 | Estimado (113 total - 6 E2E) |
| **TODOs no código** | 3 | `fiscal-provider-adapter.ts` (Bling) |
| **FIXMEs no código** | 0 | Nenhum encontrado |

---

## Módulos por Workspace

### pdv-importados (Next.js)

| Módulo | Arquivos |
|---|---|
| Rotas (`app/`) | ~26 páginas + ~10 layouts |
| Componentes (`components/`) | ~142 arquivos |
| Lib (`lib/`) | ~30+ arquivos |
| Core domínio (`core/`) | ~20+ arquivos |
| Stores Zustand (`stores/`) | 3 stores |
| Hooks customizados | ~15 hooks |
| Server Actions | ~6 arquivos `actions.ts` |
| E2E specs | ~6 specs |

### pdv-local (Tauri)

| Módulo | Arquivos |
|---|---|
| Hooks (`hooks/`) | 3 hooks principais |
| Stores (`stores/`) | 3 stores |
| Pages (`pages/`) | 3 páginas |
| Lib (`lib/`) | ~10 arquivos |

### backend (Supabase)

| Módulo | Arquivos |
|---|---|
| Migrations | 186 arquivos SQL |
| Edge Functions | 3 funções |
| Scripts utilitários | ~10 arquivos |

### shared-core (TypeScript puro)

| Módulo | Arquivos |
|---|---|
| Pricing | ~4 arquivos |
| Cart | ~3 arquivos |
| PDV (scan pipeline, invariants) | ~6 arquivos |
| Money (roundAbnt) | 2 arquivos |
| Ledger | ~4 arquivos |
| Observability | 2 arquivos |

---

## APIs e Rotas

| Tipo | Quantidade | Observação |
|---|---|---|
| **Rotas Next.js** | ~26 | Page routes no App Router |
| **API Routes** | ~1 confirmada | `/api/health` (SSRA), `/api/caixa/scan-telemetry/` |
| **Edge Functions** | 3 | `/functions/v1/sync-outbox`, `/functions/v1/validar-gerente`, `/functions/v1/fiscal-worker` |
| **PostgREST (auto)** | ~20+ tabelas | API REST auto-gerada pelo Supabase |
| **RPCs expostas** | ~30+ | Via `supabase.rpc(...)` |

---

## Documentação

| Tipo | Quantidade |
|---|---|
| **Arquivos `.md` em `docs/`** | ~55+ |
| **ADRs** | 1 confirmado (`ADR-PDV-centro-de-gravidade.md`) |
| **Checklists operacionais** | ~8 |
| **Runbooks** | 3 (`RUNBOOK_PRIMEIRO_CLIENTE`, `RUNBOOK_ROLLBACK`, `RUNBOOK_CLIENTE_PRIMEIRO_DIA`) |
| **Contratos técnicos** | ~5 (`contracts/`) |

---

## Idiomas e Internacionalização

| Idioma | Arquivo | Status |
|---|---|---|
| Português (BR) | `lib/i18n/pt.json` | 🟢 Completo |
| Mandarim (Simplificado) | `lib/i18n/zh.json` | 🟢 Completo |
| Inglês | Fallback para PT | 🟡 Sem arquivo próprio |
| Espanhol | Fallback para PT | 🟡 Sem arquivo próprio |

---

## Dependências Principais

| Pacote | Versão | Uso |
|---|---|---|
| next | 15.x | Framework web |
| react | 19.x | UI |
| typescript | 5.7 | Linguagem |
| tailwindcss | 3.4 | Styling |
| @supabase/ssr | — | Auth + DB cliente |
| zustand | 5.x | State management |
| recharts | 3.8 | Gráficos |
| zod | 3.23 | Validação |
| vitest | 3.2 | Testes unitários |
| playwright | 1.49 | Testes E2E |
| tauri | 2.x | Desktop shell |
| vite | 6.x | Build desktop |

---

## Linha do Tempo do Projeto

| Evento | Data (estimada) |
|---|---|
| MVP inicial (schema + auth + caixa) | 2026-01 |
| Painel gerente + relatórios | 2026-01/02 |
| Sync desktop + anti-replay | 2026-02 |
| Motor de preço atacado v2 | 2026-03 |
| Fiscal (fila + worker) | 2026-03 |
| Estoque por loja + transferência | 2026-04 |
| Split de pagamento | 2026-04 |
| Acessibilidade ARIA Fase 3.1 | 2026-05 |
| Admin v2 (13 rotas) | 2026-06 |
| RPC canônica v4 + bloqueio legadas | 2026-06 |
| Feature Freeze + auditoria PMO | 2026-07-08 |

---

> Ver arquitetura completa em [[Arquitetura]] · Bugs em [[Bugs]]
