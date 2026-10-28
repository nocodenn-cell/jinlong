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
| `NEXT_PUBLIC_SITE_URL` | canonical, sitemap, Open Graph; quando é apex, ativa o redirect `www.<apex>` → apex | `https://jinlong.app` |
| `NEXT_PUBLIC_ERP_URL` | links "Entrar", Privacidade, Termos | `https://app.jinlong.app` (rollback: `https://www.jinlong.app`) |
| `NEXT_PUBLIC_SITE_WHATSAPP_URL` | canal WhatsApp (`https://wa.me/<dígitos>`) | ausente → canal oculto |
| `NEXT_PUBLIC_SITE_WECHAT_ID` | canal WeChat (ID) | ausente → canal oculto |
| `NEXT_PUBLIC_SITE_ZH_REVIEWED` | `true` publica o zh-CN em produção após revisão nativa | ausente → zh é rascunho (noindex; 404 em produção) |
| `ERP_REDIRECT_ORIGIN` | após o corte de domínios, redireciona caminhos antigos do ERP (`/login`, `/auth/*`, `/admin/*`, `/caixa/*`, `/gerente/*`, `/api/*`…) com 307 | ausente → nenhum redirecionamento |

## Fontes em chinês

`app/fonts/noto-sans-sc-<500|700|900>-subset.woff2` são subsets (SIL OFL 1.1, ver `app/fonts/OFL-NotoSansSC.txt`)
só com os caracteres de cada papel (`lib/content/displayText.ts`). Depois de alterar títulos em chinês:

```bash
# requer fonttools + brotli em ambiente Python isolado e @fontsource/noto-sans-sc fora do repositório
npm run fonts:subset -w jinlong-site
```

O teste `lib/site.test.ts` falha se algum caractere ficar de fora.

## Design

Premium 2.0 (grafite, dourado e vermelho institucional): ver [docs/site/PREMIUM_2_0.md](../docs/site/PREMIUM_2_0.md).

## Migração de domínios

Ver [docs/site/MIGRACAO_SITE_ERP_DOMINIOS.md](../docs/site/MIGRACAO_SITE_ERP_DOMINIOS.md).

## Vercel

Projeto próprio (Root Directory `site`). `vercel.json` define o *Ignored Build Step*:
só há build quando `site/`, `package.json` ou `package-lock.json` da raiz mudam no commit.
Saída 0 do `git diff` = pular; diferença ou erro = buildar (padrão seguro).

### Primeiro deploy de um projeto novo

A Vercel promove o **primeiro** deploy de um projeto sem produção a `production`, mesmo vindo de
uma branch. Nesse deploy `VERCEL_ENV=production`, então o zh-CN responde 404 (portão de revisão
nativa, `lib/publication.ts`). Os deploys seguintes da branch são Previews de verdade e mostram o
zh-CN como rascunho. Sem domínio personalizado e com Vercel Authentication em "all", nenhum deles é público.
