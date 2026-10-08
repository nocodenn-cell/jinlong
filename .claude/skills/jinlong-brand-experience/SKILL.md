---
name: jinlong-brand-experience
description: Direção visual do site comercial Jinlong ("Tecnologia com Identidade", direção D). Use ao criar ou alterar qualquer página, componente ou CSS do app `site/` (site comercial independente do ERP).
---

# Jinlong · experiência de marca (direção D)

## Conceito
Tecnologia com identidade: superfícies claras, grafite e verde de operação, com um único acento vermelho (marca). O produto (PDV, estoque, caixa) é o protagonista, mostrado em janelas ilustrativas com dados fictícios. A identidade sino-brasileira aparece na marca 金龙 e na tipografia, nunca como ilustração decorativa.

## Tokens (site/styles/site.css, bloco `:root`)
- Marca `--brand #a52a32` (hover `#8a2129`); grafite `--graphite-900 #20252b` / `--graphite-700 #3a4048`; verde de operação `--green-700 #2f6b4f`; marfim `--ivory-100 #f3f1ec`; superfícies `#ffffff` / `#faf9f6`.
- Linhas `--line` / `--line-strong`; raios `--radius-sm 7px`, `--radius-md 12px`.
- Tema claro único (mesmo contrato visual do ERP). Sem modo escuro.
- A marca é provisória (bloco vermelho 金龙). A harmonização com o dragão oficial do ERP é pendência registrada; não apagar nem substituir ativos do ERP.

## Tipografia
- Geist (texto) e Geist Mono (números, `tabular-nums`), locais e com subconjunto latino. zh: Noto Sans SC em subsets por peso (500/700/900) gerados por `npm run fonts:subset` a partir do conteúdo; fallback de sistema (PingFang SC / Microsoft YaHei).
- Toda `var()` do CSS precisa estar definida no próprio CSS ou nas fontes do layout (teste `styles/site.css.test.ts`).
- Todo texto novo em chinês exige rodar `fonts:subset` (teste em `lib/site.test.ts` falha se o subset não cobrir).
- zh: `letter-spacing: 0`, sem `text-transform`.

## Regras
- Mostrar o produto (componentes isolados com dados fictícios) antes de qualquer adjetivo.
- O exemplo de atacado (10 un., R$ 22,90 → R$ 18,50) é só ilustrativo e rotulado como tal; nunca apresentar como regra universal.
- Movimento só sob `prefers-reduced-motion: no-preference`.
- Todo texto ≥ 4,5:1 (axe no e2e); foco visível; menu mobile com foco preso e Esc.
- O site é um app separado (`site/`): não importar nada de `pdv-importados`, `shared-core` nem CSS do ERP.

## Anti-padrões
Hero genérico com gradiente, dragão/nuvem como enfeite, logos de clientes ou depoimentos inventados, número de desempenho sem fonte, demonstração operacional do PDV, formulário de cadastro de leads.
