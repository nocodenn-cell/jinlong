# Site comercial Jinlong — Premium 2.0

Implementação do protótipo aprovado "Jinlong Comercial 2.0" (grafite, dourado metálico, vermelho
institucional) dentro do app `site/` (Next.js 15). O ERP (`pdv-importados/`), o banco e a autenticação
não foram alterados.

## Estrutura da home

| Seção | Componente | Observação |
|---|---|---|
| Abertura cinematográfica | `Hero` | Título, subtítulo e CTAs aprovados; efeitos só em CSS |
| A nova forma de gerir | `Statement` | + o que resolve e para quem foi criado (além do protótipo) |
| Centro de comando | `Showcase` + `CommandCenter` | 5 ambientes: visão geral, caixa, estoque, atacado, relatórios |
| Diferencial bilíngue | `Difference` | |
| Simulador de atacado | `Journey` + `WholesaleSimulator` | Dados fictícios (`lib/wholesale.ts`) |
| Conheça antes de decidir | `NextStep` | + 3 passos do que acontece depois do contato |
| Dúvidas | `Faq` | `<details>`, sem JavaScript |
| Próximo passo + formulário | `FinalCta` + `TrialForm` | Formulário real em `POST /pedido-demo` |

Conteúdo tipado em `lib/content/home.pt.ts` e `home.zh.ts` (mesmo contrato, `lib/content/types.ts`).

## Diferenças em relação ao protótipo

- **Tipografia:** Geist local no lugar de Manrope/DM Sans (o protótipo usava Google Fonts, bloqueado pela
  CSP e sem chamadas a terceiros). O itálico de destaque continua em Georgia (fonte do sistema).
- **Marca:** emblema oficial 金龍 no lugar do selo de texto 龍.
- **Idioma:** rotas `/pt-BR` e `/zh-CN` com SEO (hreflang, canonical) no lugar da troca de texto por
  JavaScript. O chinês continua rascunho (noindex) até `NEXT_PUBLIC_SITE_ZH_REVIEWED=true`.
- **Centro de comando:** abas acessíveis (setas, Home/End, `aria-selected`), rótulos visíveis sob os
  ícones e 5º ambiente "Relatórios" (fechamento de caixa).
- **Formulário:** grava o pedido de verdade (protocolo), com honeypot, limite de taxa, validação zod e
  alternativa por WhatsApp/e-mail se o registro falhar. Campos: nome, loja, WhatsApp, segmento, idioma.
- **Acessibilidade:** textos de 8–9 px subiram para no mínimo 10–11 px; cores ajustadas para contraste
  AA; trilho de palavras pausa no hover; `prefers-reduced-motion` desliga animações.
- **Removido:** faixa "prévia privada", "design concept / non-production", textos sobre "protótipo".

## Ilustrativo × real

Todas as telas do centro de comando e o simulador são **representações ilustrativas com dados
fictícios** (identificadas na página). Não há capturas reais do ERP nem dados de clientes.
Real: o registro do pedido de demonstração (`commercial_leads`, insert-only com a chave anon).

## Formulário: o que muda no lead

- `segment` passa a ser um valor fixo (`importados`, `eletronicos`, `utilidades`, `atacado`, `moda`,
  `outro`), validado no cliente e no servidor.
- `city` saiu do formulário e é opcional no schema (a coluna já aceita nulo). Nenhuma migration.

## Homologação pendente

O fluxo de ponta a ponta com gravação real depende de `SITE_DEMO_SUPABASE_URL` e
`SITE_DEMO_SUPABASE_ANON_KEY` no ambiente de Preview. Sem elas, `/pedido-demo` responde 503 e a página
mostra WhatsApp/e-mail (comportamento coberto pelo E2E). Os testes usam mocks da rota.
