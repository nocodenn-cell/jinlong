# Relatório: arquivos temporários / fora de produção

**Data:** 2026-07-18  
**Contexto:** Organização Git pré-teste operacional Missão 3  
**Ação:** NADA foi apagado. Arquivos abaixo ficam no checkpoint e no disco local; **não entram** nos commits da branch de consolidação.

## Critério

| Categoria | Destino |
|-----------|---------|
| Código de produto, migrations, testes unitários/E2E, docs oficiais | Incluir na branch |
| Logs / outputs de smoke-e2e / dumps experimentais | Checkpoint apenas |
| Skills/agents locais e planos Cursor | Checkpoint apenas (tooling local) |
| Quarentena Sentry pages-router | Checkpoint apenas (não é produção) |

## FORA dos commits de consolidação (temporários / auditoria local)

### Outputs de teste / smoke (`backend/artifacts/*.txt`)

- `e2e_caixa_local.txt`, `e2e_cycle5_*.txt`, `e2e_cycle6_*.txt`, `e2e_cycle7_*.txt`
- `e2e_missao1_*.txt`
- `homolog_*.txt`, `smoke_*.txt`, `smoke023_*.txt`
- `typecheck_caixa_partial.txt`, `verify_p0_*.txt`
- `268_create_escaped.txt`, `268_create_only.json.txt`, `268_create_only.sql` (experimentais migração 268)

### Patch experimental (não é migration versionada)

- `backend/artifacts/patch_cancelar_venda_variable_conflict.sql`

### Go/No-Go locais (evidência; podem ir a docs depois se quiserem versionar)

Mantidos no **checkpoint**; na consolidação incluímos só o go/no-go da Missão 3 se for documento operacional útil:

- `backend/artifacts/missao1_go_nogo_fluxo_venda_20260718.md`
- `backend/artifacts/missao1_go_nogo_fluxo_venda_20260718_rehomolog.md`
- `backend/artifacts/missao3_go_nogo_producao_jinlong_20260718.md` → **incluído** na doc/auditoria (Missão 3)

### Tooling / agente local

- `.agents/` (skills supabase locais)
- `skills-lock.json`
- `.cursor/plans/remoção_módulo_fiado_ad861537.plan.md`
- `docs/quarantine/sentry-pages-router/_error.jsx`

## INCLUÍDOS na consolidação (por contexto de commit)

Ver commits na branch `consolidate/missao3-*`.

## Remoção

**Nenhuma remoção executada.** Temporários permanecem no branch de checkpoint e no working tree (untracked após commits seletivos).
