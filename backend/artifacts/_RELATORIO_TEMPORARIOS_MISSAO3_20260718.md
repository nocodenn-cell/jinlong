# Relatório — arquivos temporários / exclusão da consolidação

**Data:** 2026-07-18  
**Regra:** nada foi apagado do disco. Itens abaixo ficam **fora dos commits** da branch de consolidação, mas permanecem no checkpoint `backup/checkpoint-wip-missao3-20260718`.

## Classificação

### A) Logs / outputs de teste (NÃO versionar na consolidação)

Todos os `backend/artifacts/*.txt` de smoke/E2E/homolog/typecheck/verify:

- `e2e_caixa_local.txt`, `e2e_cycle5_*`, `e2e_cycle6_*`, `e2e_cycle7_*`
- `e2e_missao1_*.txt`
- `homolog_*.txt`, `smoke_*.txt`, `smoke023_*.txt`
- `verify_p0_*.txt`, `typecheck_caixa_partial.txt`

**Motivo:** saída de execução local; regeneráveis; poluem PR.

### B) Experimentais / rascunho SQL (NÃO na consolidação)

- `backend/artifacts/268_create_escaped.txt`
- `backend/artifacts/268_create_only.json.txt`
- `backend/artifacts/268_create_only.sql`
- `backend/artifacts/patch_cancelar_venda_variable_conflict.sql`

**Motivo:** patches/experimentos; migrations canônicas estão em `backend/supabase/migrations/`.

### C) Quarentena (NÃO na consolidação)

- `docs/quarantine/**` (ex.: `_error.jsx` Pages Router / Sentry)

**Motivo:** pasta explicitamente fora do caminho de produção.

### D) Incluir na consolidação (artefatos de auditoria)

- `backend/artifacts/missao1_go_nogo_fluxo_venda_20260718.md`
- `backend/artifacts/missao1_go_nogo_fluxo_venda_20260718_rehomolog.md`
- `backend/artifacts/missao3_go_nogo_producao_jinlong_20260718.md`
- `docs/PROCEDIMENTO_CAIXAS_ORFAOS.md`
- Este relatório (`_RELATORIO_TEMPORARIOS_MISSAO3_20260718.md`)

### E) Tooling / skills (incluir se pertencerem ao monorepo)

- `.agents/skills/**` (supabase skills)
- `skills-lock.json`
- `.cursor/rules/entity-ssot.mdc`
- `.cursor/plans/remoção_módulo_fiado_ad861537.plan.md` — **fora** (plano local Cursor; não é runtime)

### F) Código / migrations / testes (incluir)

- PDV/Caixa, cadastro produto/estoque, GTIN, migrations `270`/`271`/`20260718*`, E2E specs, scripts seed, env.example

## Ação

| Ação | Alvo |
|---|---|
| Preservar no checkpoint | Tudo (A–F) |
| Commits na branch consolidação | D + E (skills) + F |
| Deixar untracked / só no backup | A, B, C, plano `.cursor/plans` |

Nenhum arquivo foi deletado do working tree nesta operação.
