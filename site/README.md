# jinlong-site — site comercial bilíngue

App Next.js independente do ERP (`pdv-importados`). Serve a home comercial em
`/pt-BR` e `/zh-CN`. **Não acessa banco, não usa Supabase e não tem credenciais**
(o teste `lib/platform.test.ts` falha se isso mudar).

## Rodar

```bash
npm run dev -w jinlong-site            # http://localhost:3100
npm run build -w jinlong-site && npm run start -w jinlong-site
```

## Qualidade

```bash
npm run typecheck -w jinlong-site
npm run lint -w jinlong-site           # reutiliza o ESLint do ERP (não duplica dependências)
npm run test -w jinlong-site           # unitários + comportamento
npm run test:e2e -w jinlong-site       # Playwright + axe (WCAG 2.2 AA), 5 navegadores; requer o app rodando em :3100
node site/scripts/measure-vitals.mjs --label depois --runs 7 http://localhost:3100/pt-BR http://localhost:3100/zh-CN
```

## Variáveis de ambiente

| Variável | Uso | Padrão |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | canonical, sitemap, Open Graph | `https://www.jinlong.app` |
| `NEXT_PUBLIC_ERP_URL` | links "Entrar", Privacidade, Termos | `https://www.jinlong.app` (após o corte: `https://app.jinlong.app`) |
| `NEXT_PUBLIC_SITE_WHATSAPP_URL` | canal WhatsApp (`https://wa.me/<dígitos>`) | ausente → canal oculto |
| `NEXT_PUBLIC_SITE_WECHAT_ID` | canal WeChat (ID) | ausente → canal oculto |
| `NEXT_PUBLIC_SITE_ZH_REVIEWED` | `true` publica o zh-CN em produção após revisão nativa | ausente → zh é rascunho (noindex; 404 em produção) |
| `ERP_REDIRECT_ORIGIN` | após o corte de domínios, redireciona caminhos antigos do ERP (`/login`, `/auth/*`, `/admin/*`, `/caixa/*`, `/gerente/*`, `/api/*`…) com 307 | ausente → nenhum redirecionamento |

## Fonte dos títulos em chinês

`app/fonts/noto-serif-sc-600-subset.woff2` é um subset (SIL OFL 1.1, ver `app/fonts/OFL.txt`)
com apenas os caracteres dos títulos zh-CN. Depois de alterar qualquer título em chinês:

```bash
# requer fonttools + brotli em ambiente Python isolado (não é dependência do projeto)
npm run fonts:subset -w jinlong-site
```

O teste `lib/content/displayText.test.ts` falha se algum caractere ficar de fora.

## Migração de domínios

Ver [docs/site/MIGRACAO_SITE_ERP_DOMINIOS.md](../docs/site/MIGRACAO_SITE_ERP_DOMINIOS.md).
