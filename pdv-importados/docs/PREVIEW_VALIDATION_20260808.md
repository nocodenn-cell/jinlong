# Validação Preview Vercel — 2026-08-08

Registro read-only pós-remoção da integração `supabase-pink-village` (`vrkwuvclaimwcodzraws`).

## UX-PDV-02 (`26dca96a`)

| Campo | Valor |
|-------|--------|
| Branch auxiliar (árvore 26dca96 + doc) | `cursor/vercel-preview-26dca96-633a` |
| Deployment Preview | `dpl_2k6BB4zZyd36nxnt8NcU4dRdKMAC` |
| URL | https://pdv-importados-k2qkq3of5-jinlong.vercel.app |
| Estado | **READY** (~3m27s build) |
| Smoke | HTTP 302 → Vercel SSO (proteção Preview); sem 500/build error |

## PR #268 — `cursor/fechamento-ui-ux-633a`

| Campo | Valor |
|-------|--------|
| Deployment Preview (tip `158c4653`) | `dpl_EVKGio6Z4Txg2SFnwHAC59NWRCin` |
| URL | https://pdv-importados-c00l84m2o-jinlong.vercel.app |
| Alias branch | https://pdv-importados-git-cursor-fechamento-ui-ux-633a-jinlong.vercel.app |
| Estado | **READY** (~3m24s build) |

## Redeploy manual anterior (825bf235, production target)

| Campo | Valor |
|-------|--------|
| Deployment | `dpl_9Xuheh8fMqw33wxcQGDJ5LmpvMFk` |
| `/api/health` (prod) | 200 — `gitSha` `825bf235…` |

Sem alteração de env Supabase jinlong/biak.

## Fechamento onda — UX-10 / Receber / ds-coverage (branch tip pós-push)

| Gate | Resultado |
|------|-----------|
| `npm run check:ds-coverage` | **12/12 (100%)** |
| `npm run typecheck` | OK |
| Vitest implantacao/provisionamento | 20/20 |
| P0 matrices | 23/23 |

**Auditoria visual autenticada:** não executada no agente (Preview SSO + credenciais tenant). Checklist humano: `/admin/financeiro?tab=receber`, `/admin/configuracoes`, `/admin/implantacao`, `/admin/provisionamento`, `/caixa`.

Atualizar linha Deployment Preview após CI Vercel no SHA final desta entrega.
