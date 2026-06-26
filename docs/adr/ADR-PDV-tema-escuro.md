# ADR — Tema escuro do PDV

| Campo | Valor |
|--------|--------|
| **ID** | ADR-PDV-002 |
| **Título** | Tema escuro do PDV — **rejeitado**; PDV permanece em tema único claro |
| **Status** | **Rejeitado** — decisão final: o PDV permanece em tema único claro, sem roadmap para escuro. |
| **Data** | 2026-06-26 |
| **Contexto** | A Fase 0 (Layout Compiler) travou o sistema em **tema único claro** ("cara de Bling"). O Plano Mestre v2 chegou a citar um tema escuro para o PDV; esta decisão **encerra** essa hipótese para alinhar documentação e código. |

---

## Contexto

- **Contrato vigente (código):** tema **único claro**. O modo escuro foi
  **aposentado na Fase 0 — Layout Compiler**:
  - `pdv-importados/theme.config.ts` → `ACTIVE_THEME = 'classico'` (claro, imutável);
  - `pdv-importados/tailwind.config.js` → `darkMode` aponta para um seletor
    (`.theme-dark-disabled`) que **nunca** existe no DOM, neutralizando utilitárias `dark:`;
  - tokens de superfície/texto ativos vêm de `styles/theme-oriental.css` (claro).
- **Hipótese descartada:** o Plano Mestre v2 cogitou um tema escuro para o
  ambiente operacional do PDV. A decisão de produto/design é **não** seguir esse
  caminho: o PDV deve permanecer **clean e claro**, e a documentação não deve
  carregar um roadmap que contradiz o código.

Documentos relacionados:

- [Plano Mestre — Pilar 2 (Design System), §Temas](../plano-mestre/02-DESIGN-SYSTEM.md)
- [Arquitetura do PDV — §7 Roadmap](../plano-mestre/05-ARQUITETURA-PDV.md)

---

## Decisão

1. **Manter o tema único claro como contrato vigente.** Nenhuma evolução para
   tema escuro será feita.
2. **Encerrar este ADR como Rejeitado** para eliminar a ambiguidade entre
   documentação e código. O PDV permanece **clean e claro**.
3. O tema único claro continua sendo aplicado via **tokens** (sem cor fixa). Isso
   não é um preparo para escuro — é apenas a higiene de design já vigente.

## Consequências

- **Positivas:** documentação e código passam a dizer a **mesma coisa** — tema
  único claro, sem exceção. Some a divergência "claro vs. claro+escuro".
- **Negativas:** caso, no futuro, se queira um tema escuro, será necessário um
  **novo ADR** (não a reabertura deste), com sign-off e tokens próprios.

## Próximos passos

Nenhum. O PDV permanece claro. Plano Mestre, Pilar 2 (§Temas), Roadmap do PDV e a
tabela de divergências do README foram ajustados para refletir esta decisão final.

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-06-26 | Rascunho inicial — registrava tema escuro do PDV como roadmap. |
| 2026-06-26 | **Rejeitado** — decisão final: PDV permanece em tema único claro, sem roadmap para escuro. Documentação alinhada ao código. |
