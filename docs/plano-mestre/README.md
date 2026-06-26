# Plano Mestre — Arquitetura, Design System e UX (JinLong / FastProduct)

> Documentação oficial do ecossistema. Esta pasta é a **fonte única de verdade**
> para arquitetura, design system e padrões de UX. Toda evolução deve ocorrer
> **dentro** da arquitetura aqui descrita — nunca em paralelo.

## Objetivo

Estabelecer uma arquitetura única para todo o sistema FastProduct / JinLong,
garantindo consistência entre módulos, alta produtividade operacional,
facilidade de manutenção e escalabilidade — com interface familiar para
usuários do Bling, preservando identidade visual própria.

## Princípios fundamentais

1. A informação vem antes do design.
2. Cada tela possui um único objetivo principal.
3. As ações mais utilizadas exigem o menor número possível de cliques.
4. O usuário nunca deve precisar pensar onde uma ação está localizada.
5. Se o usuário aprendeu uma tela, aprendeu o sistema inteiro.
6. Componentes devem ser reutilizados sempre que possível.
7. Fluxos operacionais permanecem consistentes em todos os módulos.
8. O Dashboard é um ambiente gerencial.
9. O PDV é um ambiente operacional.

## Os quatro pilares

| # | Documento | Define | Nunca descreve |
|---|-----------|--------|----------------|
| 1 | [`01-ARQUITETURA.md`](./01-ARQUITETURA.md) | Shell, navegação, estrutura, layouts, responsividade | Cores, componentes |
| 2 | [`02-DESIGN-SYSTEM.md`](./02-DESIGN-SYSTEM.md) | Tokens, componentes, estados, temas, tipografia, espaçamentos | Regras de negócio |
| 3 | [`03-PADROES-UX.md`](./03-PADROES-UX.md) | CRUD, filtros, pesquisa, paginação, feedback, modais, confirmações, fluxos | Implementação de módulo |
| 4 | [`04-MODULOS.md`](./04-MODULOS.md) | Regras de negócio, fluxos, permissões, integrações, casos de uso | Layout, componentes |

### Documento complementar

| Documento | Define | Nunca descreve |
|-----------|--------|----------------|
| [`05-ARQUITETURA-PDV.md`](./05-ARQUITETURA-PDV.md) | PDV como subsistema independente: objetivo, limites de responsabilidade, fluxos, relação com módulos, integração com o Bling, roadmap | Layout, componentes |
| [`06-CONTRATO-DE-EVENTOS.md`](./06-CONTRATO-DE-EVENTOS.md) | Eventos do domínio (Venda, Estoque, Financeiro, Fiscal): payload, produtores, consumidores, garantias transacionais, versionamento | Layout, componentes |
| [`07-MAQUINA-DE-ESTADOS-PDV.md`](./07-MAQUINA-DE-ESTADOS-PDV.md) | Ciclo de vida da venda: estados, transições permitidas, regras de negócio, diagrama e tabela de transições | Layout, componentes |

> O PDV tem arquitetura própria por contrato (Pilar 1, §6). O documento
> complementar consolida o **contrato vigente** do PDV e isola o que é **roadmap**
> futuro. Decisões futuras do PDV viram ADRs em [`docs/adr/`](../adr/).

## Regras arquiteturais (proibições)

É **proibido**:

- Criar layouts paralelos.
- Duplicar componentes.
- Criar novas paletas.
- Alterar tipografia.
- Alterar espaçamentos.
- Criar variantes sem aprovação do Design System.

Toda evolução ocorre **dentro** da arquitetura existente.

## Filosofia final

O usuário deve reconhecer imediatamente qualquer tela do sistema. Toda nova
funcionalidade deve parecer que sempre existiu. A arquitetura deve permitir
evolução contínua sem perda de consistência. A experiência do JinLong é
inspirada nos fluxos operacionais e nos padrões de usabilidade do Bling,
mantendo identidade visual, componentes e arquitetura próprios do ecossistema
JinLong.

---

## Estado de conformidade & divergências conhecidas

Esta documentação descreve o **alvo arquitetural**. Onde o código atual ainda
diverge do alvo, registramos abaixo para que a evolução seja rastreável.
Documentar a divergência é obrigatório — escondê-la não.

| Tema | Alvo (Plano) | Realidade no código | Decisão vigente |
|------|--------------|---------------------|-----------------|
| **Temas** | Tema **único claro** (decisão final) | Tema **único claro** — dark mode aposentado na *Fase 0 — Layout Compiler* (`pdv-importados/theme.config.ts`, `tailwind.config.js` com `darkMode` neutralizado) | ✅ Conforme — documentação e código alinhados. O tema escuro do PDV foi **rejeitado** em [ADR-PDV-002](../adr/ADR-PDV-tema-escuro.md); não há roadmap para escuro. Ver pilar 2. |
| **Tokens semânticos** | Tokens claros/escuros simétricos | `styles/tokens/semantic.css` ainda referencia paleta escura legada (`--color-night-950`, etc.) herdada da era *dragon-dark* | Token semântico de superfície/texto ativo vem de `theme-oriental.css` (claro). `semantic.css` é legado em retirada. |
| **i18n** | Português + Chinês, pronto para novos idiomas | Implementado em `src/lib/i18n` (`pt.json`, `zh.json`) | ✅ Conforme. |
| **AppShell único** | Estrutura única para toda tela | Existem shells distintos (`gerente`, `admin`, `caixa/PDV`) com primitivas compartilhadas | Convergência em andamento; PDV mantém shell independente por contrato (ver pilar 1). |

> Mantenha esta tabela atualizada a cada mudança relevante. Quando uma
> divergência for resolvida no código, mova-a para "conforme" ou remova-a.
