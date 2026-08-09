# Go-Live — Status Final (Passo 7)

**Data:** 2026-08-09  
**Decisão:** ✅ **READY FOR GO-LIVE**  
**Produção:** https://pdv-importados.vercel.app

---

## 1. Produção validada

| Campo | Valor |
|---|---|
| Host | `pdv-importados.vercel.app` |
| `deploymentId` | `dpl_FXFHdqB6de5hZxgTSABuF2P9tUkq` |
| `gitSha` | `2afa14ca3cc5c00ee8361d29a06934610350b7ac` |
| Ref (Vercel meta) | **`main`** |
| Target | `production` · `READY` |
| SSRA | ✅ Success — [run 31316048037](https://github.com/nocodenn-cell/fastproduct/actions/runs/31316048037) |

```bash
curl -sS https://pdv-importados.vercel.app/api/health
# {"deploymentId":"dpl_FXFHdqB6de5hZxgTSABuF2P9tUkq","gitSha":"2afa14ca3cc5c00ee8361d29a06934610350b7ac",...}
```

> `/api/health` não expõe `ref`; a ref `main` foi confirmada via API Vercel (`meta.githubCommitRef`).

---

## 2. Gates finais (locais — tip docs Passo 6)

| Gate | Comando | Resultado |
|---|---|---|
| typecheck | `npm run typecheck` | ✅ exit 0 |
| lint | `npm run lint` | ✅ exit 0 (0 errors; 3 warnings legados e2e `any`) |
| vitest | `npm run test -- --run` | ✅ **176** files / **899** tests |
| build | `npm run build` | ✅ Compiled successfully |
| DS Sprint 0 | `npm run check:ds-sprint0` | ✅ exit 0 (12/12 telas migradas) |
| Entity SSoT | `npm run check:entity-ssot` | ✅ OK (6 avisos legado) |

Workspace: `pdv-importados` · branch `cursor/go-live-docs-passo6-dce4` (PR #287).

---

## 3. Trilha P0 fechada

| Passo | Resultado | Evidência |
|---|---|---|
| 1 Produção = main | ✅ | #282 → `28b14b76` |
| 2 Schema | ✅ | #283 → `cfec6040` |
| 3 Bugs críticos | ✅ | #284/#285 → `cb45e52f` |
| 4 Redeploy + SSRA | ✅ | SSRA verde em `2afa14ca` |
| 5 UI/UX waves | ✅ | #286 → `2afa14ca` |
| 6 Docs + GO | ✅ | #287 (docs) · `go_autorizado=true` no banco |
| 7 Gates finais | ✅ | Este documento |

---

## 4. Implantação (`/admin/implantacao` — Matriz)

| Campo | Valor |
|---|---|
| Loja | Matriz `a0000001-0000-4000-8000-000000000001` |
| Checklist | **35 CONCLUIDO** · **1 NA** (`fiscal.nfce`) |
| `go_autorizado` | **true** |
| `go_autorizado_em` | 2026-08-09 15:00:00 UTC |

---

## 5. Documentos canônicos

- [`GO_LIVE_CERTIFICATION_REPORT.md`](../GO_LIVE_CERTIFICATION_REPORT.md) — **GO**
- [`GO_LIVE_EXECUTIVO_RESUMO.md`](../GO_LIVE_EXECUTIVO_RESUMO.md) — **PRONTO PARA GO-LIVE**
- [`GO_LIVE_ASSINATURA_2026-08-09.md`](./GO_LIVE_ASSINATURA_2026-08-09.md)
- Arquivo histórico: [`archive/go-live-pre-2026-08-09/`](./archive/go-live-pre-2026-08-09/)

---

## 6. Pendência de merge (docs)

PR **#287** (docs Passo 6 + este status) deve ser **Approve + Squash and merge** para versionar a documentação em `main`.  
Produção de código já está em `2afa14ca` (#286); o merge do #287 só altera docs (novo SHA docs-only).

---

# ✅ READY FOR GO-LIVE
