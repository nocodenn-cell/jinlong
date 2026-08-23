# Changelog da auditoria D0

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
