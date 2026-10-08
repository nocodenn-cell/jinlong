---
name: jinlong-brand-experience
description: Direção visual do site comercial Jinlong ("Livro-Caixa" com paleta e tipografia "Laca e Ouro"). Use ao criar ou alterar qualquer página, componente ou CSS do app `site/` (site comercial independente do ERP).
---

# Jinlong · experiência de marca

## Conceito
Livro-caixa sobre papel: o produto real (PDV, estoque, caixa) é o protagonista. Elementos sino-brasileiros entram só como tipografia, o monograma 金 e fios dourados. Nunca como ilustração decorativa.

## Tokens (site/styles/site.css)
- Papel `#f6f1e7`, cartão `#fbf8f1`, tinta `#1c1a16`, tinta suave `#4f4a3f`.
- Vermelhão `#a8261c` (CTA, números, carimbo), ouro `#b58a1e` (só decorativo), ouro-tinta `#6f5210` (texto/foco).
- Tema claro único (mesmo contrato visual do ERP). Sem modo escuro.

## Tipografia
- Display: Fraunces (pt) / subset da Noto Serif SC 600 (zh, só títulos). Corpo: IBM Plex Sans + fonte CJK do sistema (PingFang SC / Microsoft YaHei). Números: IBM Plex Mono com `tabular-nums`.
- Toda `var()` do CSS precisa estar definida no próprio CSS ou nas fontes do layout (teste `styles/site.css.test.ts`).
- zh: `line-height` ≥ 1.8, sem `letter-spacing` negativo, sem `text-transform`.

## Regras
- Mostrar o produto (componentes isolados com dados fictícios) antes de qualquer adjetivo.
- Cantos de 2–3 px, linhas finas, sem gradiente, sem sombra chapada, sem cards-dentro-de-cards.
- Movimento: só opacidade/translate, sempre sob `prefers-reduced-motion: no-preference`.
- Todo texto ≥ 4,5:1; foco visível 3 px; alvos ≥ 44 px em controles principais.
- O site é um app separado (`site/`): não importar nada de `pdv-importados`, `shared-core` nem CSS do ERP.

## Anti-padrões
Hero genérico com gradiente, ícones em círculo coloridos, "dragão/nuvem" como enfeite, logos de clientes ou depoimentos inventados, qualquer número de desempenho sem fonte.
