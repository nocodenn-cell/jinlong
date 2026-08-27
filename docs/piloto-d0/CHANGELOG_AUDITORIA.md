# Changelog da auditoria D0

## 2026-08-27 — certificação GO em `e1327e62`

- `origin/main` e produção: `e1327e62312d53bb005e0614801b8725b485b2ee`.
- Decisão: **GO**. Candidata `ede1f459` / `codex/piloto-d0-main-clean` **superseded**.
- Promovidos na consolidação: #313 kardex SSOT-04; #324 DRAFT no recebimento,
  atacado≥varejo, troco só dinheiro; #330 opções do modal + WebKit no E2E.
- PRs paralelas saneadas sem merge (#329, #328, #325, #320, #318, #297, #258,
  #257). Resta #290 (Dependabot), fora do go-live.
- Gates: SSRA verde; E2E crítico PASS; shared-core 8; pdv-importados 33.
  Playwright completo residual (flake/infra) — não tratado como regressão D0.
- Snapshot: [CERTIFICACAO_GO_LIVE_E1327E62.md](./CERTIFICACAO_GO_LIVE_E1327E62.md).
- Próxima sprint proposta (não iniciada): [PROXIMA_SPRINT.md](./PROXIMA_SPRINT.md).

## 2026-08-23 — recomposição sobre `main`

- Base imutável confirmada: `ede1f459785f79ced4df0cd9a97a6ccdd3e26220`.
- A cadeia histórica #318 → #320 não foi incorporada por herança.
- O gate financeiro canônico e posterior de `main` foi preservado; o reparo do
  gate truncado da branch histórica não foi portado.
- `exceljs` já pertence à base de `main`; nenhuma restauração ou alteração de
  dependência foi realizada nesta candidata.
- Duas correções D0 são preparadas: tiers como autoridade única do atacado e
  remessa/recebimento com quantidades estritamente positivas.
- Nenhuma migration foi aplicada remotamente e nenhuma homologação foi
  executada. Esta candidata não autoriza GO do piloto.
