---
name: jinlong-bilingual-ux
description: Regras de UX bilíngue pt-BR / zh-CN do site comercial Jinlong (conteúdo, glossário, fontes, publicação e revisão humana). Use ao editar lib/site/content, rotas [locale] ou qualquer texto do site.
---

# Jinlong · UX bilíngue

## Estrutura
- Conteúdo tipado em `lib/site/content/` (`home.pt.ts`, `home.zh.ts`, contrato em `types.ts`). Mesmas chaves nos dois idiomas; `lib/site/site.test.ts` falha se divergirem.
- Rotas `/pt-BR` e `/zh-CN`; `lang` no wrapper e sincronizado no `<html>` (`SiteLangSync`). Preferência no cookie `idioma_preferido` (`pt`|`zh`).
- Nunca criar segundo frontend nem copiar componentes por idioma.

## Publicação do chinês
- O texto zh é rascunho de IA. Produção só publica com `NEXT_PUBLIC_SITE_ZH_REVIEWED=true`, após revisão de falante nativo com conhecimento do comércio brasileiro.
- Enquanto não revisado: banner de rascunho, `noindex`, sem hreflang zh, 404 em produção.

## Glossário (validar na revisão)
varejo 零售 · atacado 批发 · estoque 库存 · caixa (PDV) 收银 · fechamento do caixa 收银对账 · conta a receber 应收账款 · etiqueta 标签 · código de barras 条形码 · loja de teste 试用店铺. Termos de comércio local (Pix, fiado, NF-e) exigem decisão do revisor: manter em português ou explicar.

## Layout
- Comprimento: zh costuma ser ~40% mais curto, pt mais longo. Nada de largura fixa em botões.
- Nomes de produto em zh mostram o nome em português como apoio, com `lang` correto.
- Moeda sempre BRL via `Intl.NumberFormat(locale)`.
- Links para páginas só em português (privacidade/termos) recebem `hrefLang="pt-BR"` e aviso "（仅葡语）".

## Proibido
Texto fixo em componentes, tradução automática em runtime, afirmar funcionalidade que o produto não entrega.
