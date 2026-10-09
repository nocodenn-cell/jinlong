# Site comercial Jinlong · direção D — pendências e diferenças visuais

Estado: reconstrução visual concluída na branch `feat/site-comercial-bilingue-v1` (PR #491). Nada publicado em produção; chinês bloqueado até revisão nativa.

## Diferenças em relação aos mockups (comparação lado a lado, 1440 px e 390 px)

Referência: `Desktop.html` / `Mobile.html` renderizados em Chromium. Captura do site: `next start` local, mesmo navegador.

| Item | Mockup | Site | Motivo |
|---|---|---|---|
| Botão "Solicitar 15 dias de teste" e nota de teste | Presentes | Ausentes | CTA de canal só aparece com `NEXT_PUBLIC_SITE_WHATSAPP_URL` / `NEXT_PUBLIC_SITE_WECHAT_ID` válidos (decisão 5) |
| Link "Contato" no menu | Presente | Ausente | Mesmo motivo: sem canal configurado não há destino |
| Bloco "Experimente o caixa agora" | Presente | Removido | Decisão: sem demonstração operacional do PDV; só o simulador ilustrativo |
| Campos de contato no rodapé | Placeholders (WhatsApp, WeChat, e-mail, CNPJ) | Só canais configurados | Nunca inventar contato |
| Telas "Fechamento" e "Painel" | Valores do mockup (R$ 3.691,00; Clientes 37) | Dados de `lib/products.ts` (R$ 3.833,00; Itens 212; Estoque crítico 3) | Dados fictícios revisados e testados; diferença só de conteúdo |
| Separador do lema (`·`) | Bolinha espaçada | Caractere `·` | Ajuste fino de espaçamento pendente |
| Glifo 金龙 na marca | Ligeiramente maior | Tamanho do CSS portado | Ajuste fino pendente |

Demais seções (hero, benefícios, telas, atacado, dois idiomas, passos, CTA final, rodapé) seguem a estrutura e os tokens da referência. Fidelidade pixel a pixel **não** é declarada: a comparação foi visual, sem diff automático.

## Verificação (build local, produção)

- Typecheck, lint e 32 testes unitários: verdes.
- E2E Playwright em Chromium, Firefox e WebKit (e Pixel 7): 82 passaram, 2 ignorados (Tab no WebKit). Inclui axe WCAG 2.2 AA em 360, 390, 768 e 1440 px nos dois idiomas, sem rolagem horizontal, teclado, menu mobile, simulador, troca de idioma, 404, cabeçalhos de segurança, CLS.
- Lighthouse mobile (simulado, `localhost`):
  - pt-BR (após correções de ordem de títulos e rótulo da marca): desempenho 93, acessibilidade 100, boas práticas 100, SEO 100; LCP 2,3 s. Primeira medição, antes das correções: desempenho 88, acessibilidade 98, TBT 390 ms.
  - zh-CN (medição anterior às correções; não repetida): desempenho 89, acessibilidade 98, boas práticas 100, SEO 66 (esperado: `noindex` enquanto é rascunho); LCP 2,6 s.
  - Reexecutar após o próximo deploy de Preview; os números de `localhost` não substituem a medição no Preview real.

## Pendências

1. **Identidade**: harmonizar o bloco 金龙 provisório com o dragão oficial do ERP (decisão de marca).
2. **Revisão nativa do chinês** (bloqueia a publicação do zh-CN em produção; `NEXT_PUBLIC_SITE_ZH_REVIEWED`). Rodar `npm run fonts:subset` se o texto mudar.
3. **Canais**: valores reais de WhatsApp e WeChat (variáveis de ambiente na Vercel; nunca no código).
4. **Dados da empresa**: CNPJ, e-mail comercial, política de privacidade e termos hospedados.
5. **Telas do ERP**: substituir as janelas ilustrativas por capturas reais (com dados fictícios) quando aprovado.
6. **Frases a validar com o negócio**: "Cresça com segurança" e o rótulo "Ver demonstração" (hoje leva ao simulador, não a uma demonstração guiada).
7. **Ajustes finos**: separador do lema e tamanho do glifo da marca.
8. **TBT**: 390 ms na primeira medição simulada; reavaliar no Preview e investigar o JS compartilhado (`131-*.js`, 45 kB) se necessário.
9. **Vercel**: `site/vercel.json` e `site/scripts/vercel-ignore.sh` deste PR foram alinhados com o hotfix (PR #494). Ao integrar, prevalece a versão do hotfix.
10. Autorizações ainda necessárias: merge do #494 e do #491; migração para `app.jinlong.app`; publicação do chinês.
