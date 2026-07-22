# Relatório: arquivos temporários / fora de produção

**Data:** 2026-07-18
**Contexto:** Organização Git pré-teste operacional Missão 3
**Ação:** NADA foi apagado. Arquivos abaixo ficam no checkpoint `checkpoint/wip-missao3-20260718` e no disco local; **não entram** nos commits da branch `consolidate/missao3-20260718`.

## FORA dos commits de consolidação

### Outputs de teste / smoke (`backend/artifacts/*.txt`)
- e2e_*, smoke_*, homolog_*, verify_p0_*, typecheck_*, smoke023_*
- 268_create_* (experimentais)

### Patch experimental
- backend/artifacts/patch_cancelar_venda_variable_conflict.sql

### Tooling / agente local
- .agents/ (skills supabase locais)
- skills-lock.json
- .cursor/plans/*
- docs/quarantine/sentry-pages-router/_error.jsx

## Remoção
**Nenhuma remoção executada.** Preservados no checkpoint remoto e no working tree.
