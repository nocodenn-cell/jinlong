# Sentry — Migração de Configuração (SDK v10 / Next 15)

> Corrige os avisos de build do Sentry e documenta a solução do erro EPERM de cache
> no Windows. Data: 2026-07-12. SDK: `@sentry/nextjs@10.49`, Next `15.5`.

## O que mudou

| Aviso de build (antes) | Correção |
|---|---|
| `disableLogger is deprecated … Use webpack.treeshake.removeDebugLogging` | Movido para `webpack: { treeshake: { removeDebugLogging: true } }` em `next.config.js`. |
| `automaticVercelMonitors is deprecated … Use webpack.automaticVercelMonitors` | Movido para `webpack: { automaticVercelMonitors: false }` em `next.config.js`. |
| `Could not find onRequestError hook in instrumentation file` | Adicionado `export const onRequestError = Sentry.captureRequestError` em `instrumentation.ts` (+ init no runtime `edge`). |
| `sentry.client.config.js … move to instrumentation-client.ts` | Conteúdo migrado para `instrumentation-client.ts` (com `onRouterTransitionStart`); `sentry.client.config.js` removido. |

Após as mudanças, `next build` **não emite mais** nenhum desses avisos.

### Arquivos

- `next.config.js` — opções de build sob o wrapper `webpack` (v10).
- `instrumentation.ts` — `register()` (nodejs + edge) e `onRequestError`.
- `instrumentation-client.ts` — **novo**; init do cliente + `onRouterTransitionStart`.
- `sentry.client.config.js` — **removido** (substituído pelo acima).
- `sentry.server.config.js` — inalterado (ainda importado por `instrumentation.ts`).

### Observação sobre `hideSourceMaps`

Mantido como está: não gerou aviso de depreciação nesta versão. Se um upgrade futuro
avisar, migrar para o bloco `sourcemaps: { … }`.

## Erro EPERM de cache no Windows

Sintoma (apenas Windows, em `npm run dev`/`build`):

```
Error: EPERM: operation not permitted, rename
'…\.next\cache\webpack\…\<hash>.pack.gz_' -> '…\.next\cache\webpack\…\<hash>.pack.gz'
```

Não é um bug do código — é o webpack tentando renomear arquivos de cache que o
sistema mantém **bloqueados**. Causas típicas e soluções, em ordem de eficácia:

1. **OneDrive/Dropbox sincronizando a pasta do projeto** (causa mais comum).
   - Mova o repositório para um caminho **fora** do OneDrive (ex.: `C:\dev\fastproduct`), **ou**
   - Pause a sincronização, **ou** exclua `.next` da sincronização.
2. **Antivírus (Defender/terceiros) escaneando `.next\cache` em tempo real.**
   - Adicione a pasta do projeto (ou `.next`) às **exclusões** do antivírus.
3. **Cache corrompido / processo `next` anterior travado.**
   - Feche processos Node, apague o cache e reconstrua:
     ```powershell
     taskkill /F /IM node.exe
     rd /s /q .next
     npm run dev
     ```
4. **Dois `next dev`/`build` rodando ao mesmo tempo** na mesma pasta — rode apenas um.
5. **Último recurso (dev):** desabilitar o cache de filesystem do webpack em
   desenvolvimento no Windows (rebuilds ficam mais lentos). Snippet opcional para
   `next.config.js`, dentro de `webpack(config, { dev }) { … }`:
   ```js
   if (dev && process.platform === 'win32') {
     config.cache = { type: 'memory' }
   }
   ```
   > Não aplicado por padrão — só adicione se 1–4 não resolverem, pois reduz a
   > velocidade de recompilação incremental.

## Ferramentas de apoio (evitar regressões)

- **`npm run clean-cache`** (em `pdv-importados`) — roda `rimraf .next/cache` para
  resolver rapidamente o EPERM/cache corrompido no Windows.
- **Auditoria contínua** — pipeline `scripts/audit/continuous-audit.mjs` que roda em
  sequência `lint → guard:core → stress:pdv → gate:pdv` e **reporta só falhas novas**
  (as pré-existentes ficam em `scripts/audit/audit-baseline.json`). `stress:pdv`/`gate:pdv`
  são marcados `SKIPPED` quando não há Supabase/seed configurado. **Sempre grava**
  `scripts/audit/last-report.md` (+ `.json`, efêmeros/gitignored).
  - Rodar: `npm run audit:continuous -w pdv-importados` (ou `node scripts/audit/continuous-audit.mjs`).
  - **Por que não fica em `package.json` da raiz:** editar o `package.json` da raiz
    dispara os pipelines de **backend/Rust** (path filter de `ci-backend-supabase.yml`
    e `ci-pdv-local.yml`). Registrar o comando em `pdv-importados/package.json`
    evita que mudanças de frontend acordem CI não relacionada — **sem esconder
    falhas reais** (backend/Rust ainda roda quando `backend/**`, `pdv-local/**` ou as
    dependências da raiz mudam de fato).

### Regras do baseline (política anti-regressão)

- **Falha nova** (não listada no baseline) → o pipeline **bloqueia** (exit 1).
- **Falha conhecida** → registrada em `scripts/audit/audit-baseline.json` e **ignorada**.
- **Dívida resolvida** → **remover** a entrada do baseline (o pipeline volta a cobrar).
- Baseline atual: `guardCore.allowedFiles` (ProdutoFormModal/LoginForm) e
  `lint.allowedSignatures` (8 itens em `e2e/*` e 2 no caixa) — todos pré-existentes.

## Interpretando erros capturados no PDV (Sentry)

Guia rápido para triagem. Os erros de UI já chegam ao usuário traduzidos por
`mensagemErroParaUsuario`; no Sentry você vê o **detalhe técnico** — use este mapa
para decidir a primeira ação.

| Assinatura no Sentry (trecho) | Causa provável | Primeira ação | Gravidade |
|---|---|---|---|
| `new row violates row-level security policy` | Perfil/loja do usuário sem permissão, ou `loja_id` divergente | Conferir `usuarios.perfil`/`loja_id` do operador; RLS da tabela | P2 |
| `duplicate key value violates unique constraint` | Cadastro duplicado (ex.: e-mail de funcionário, venda idempotente) | Verificar se é reenvio; a constraint está protegendo dado | P3 |
| `Could not find the function public.<rpc>` | Migration ausente no ambiente | Rodar migrations pendentes no Supabase | P1 |
| `canceling statement due to statement timeout` | Query lenta / índice faltando | `get_advisors` (Supabase); revisar a query | P2 |
| `Failed to fetch` / `NetworkError` | Rede/Supabase indisponível ou env errada | Checar status Supabase e `NEXT_PUBLIC_SUPABASE_*` | P1 se em massa |
| `invalid input syntax for type uuid` | Id malformado vindo da UI (estado stale) | Atualizar a tela; validar origem do id | P3 |
| erro em `finalizar_venda_transacional_canonica_v4` | **Falha no núcleo de venda** | **Escalonar** — não alterar a RPC sem autorização | **P1** |
| `EPERM … .next/cache … rename` | Cache webpack no Windows (OneDrive/antivírus) | `npm run clean-cache`; ver seção EPERM acima | dev-only |
| Frames só de `chrome-extension://` | Erro de extensão do navegador, não do app | Já é filtrado no `beforeSend` — ignorar | ruído |

Tags úteis já emitidas pelo error-boundary do caixa (`app/caixa/error.tsx`):
`modulo=pdv-sale`, `plataforma=web`, `layer=error-boundary-caixa`. Filtre por elas
no Sentry para isolar erros do fluxo de venda.

### Os 6 tipos de erro (referência rápida)

| Tipo | Assinatura típica | Severidade | Ação |
|---|---|---|---|
| **Erro de RPC** | `Could not find the function public.<rpc>` / `PGRST202` | **P1** se for RPC de venda; senão P2 | Migration ausente → aplicar; se `finalizar_venda*` → escalonar |
| **Erro de RLS** | `new row violates row-level security policy` / `permission denied` | **P2** | Conferir `perfil`/`loja_id`; revisar policy da tabela |
| **Duplicate key** | `duplicate key value violates unique constraint` | **P3** | Ver se é reenvio; a constraint está protegendo (idempotência) |
| **Timeout** | `statement timeout` / `canceling statement` | **P2** | `get_advisors` (índices), revisar query lenta |
| **Falha no fluxo de venda** | erro em `finalizar_venda_transacional_canonica_v4` | **P1** | **Escalonar** — não alterar a RPC sem autorização |
| **UUID inválido** | `invalid input syntax for type uuid` | **P3** | Estado stale na UI → atualizar tela; validar origem do id |

### Política de triagem (definições)

**Severidade**
- **P1 (acordar responsável, mesmo fora de horário):** fluxo de venda, login em
  massa, `/api/health` 5xx, RPC de venda ausente.
- **P2 (resolver no mesmo dia):** RLS, timeout, histórico/exportação, reconciliação.
- **P3 (backlog da semana):** duplicate key esperado, UUID stale, ruído de UI.

**Tags** (padronizar ao `Sentry.captureException(e, { tags })`)
- `modulo` — ex.: `pdv-sale`, `gerente-cadastro`, `fiscal`, `caixa-sessao`.
- `plataforma` — `web` (Next) ou `desktop` (Tauri/pdv-local).
- `layer` — ex.: `error-boundary-caixa`, `server-action`, `rpc`.
- `rpc` — nome da RPC quando aplicável (facilita agrupar por função).

**Ambiente** (`environment` no init)
- `production` / `staging` / `development`. Confirme que o deploy usa o correto;
  filtre issues por `environment=production` na triagem de incidentes reais.
  Dev não envia (`enabled: NODE_ENV !== 'development'`) salvo `*_FORCE_ENABLE`.

**Fluxo de triagem**
1. Filtrar por `environment=production` e ordenar por frequência/últimas 24h.
2. Classificar severidade pela tabela acima; P1 → agir/escala imediata.
3. Correlacionar com `/admin/auditoria` (alertas de venda) e Vercel Runtime.
4. Registrar risco novo em `RISK_REGISTER_GOLIVE.md`; resolver ou aceitar (baseline).
5. Objetos protegidos (`finalizar_venda*`, comissão, `vendas`) → **escalonar**, não corrigir sem autorização.

## Boas práticas de observabilidade (para a equipe)

1. **Severidade primeiro.** Qualquer erro tocando `finalizar_venda*`, login em massa
   ou `/api/health` 5xx é **P1** — ver limiares no `POST_GOLIVE_MONITORING_PLAN.md`.
2. **Não silencie no cliente.** Erros de UI já são amigáveis (`mensagemErroParaUsuario`);
   o **detalhe técnico vai para o Sentry/console**, nunca para a tela (SQL cru fora da UI).
3. **Use tags e `environment`.** Confirme `environment` correto (prod/staging) e adicione
   tags de módulo ao capturar manualmente (`Sentry.captureException(e, { tags })`).
4. **Replays só em erro.** `replaysSessionSampleRate=0`, `replaysOnErrorSampleRate=1` —
   mantém custo baixo e ainda dá contexto visual no incidente.
5. **PII mascarada.** `maskAllText` + `blockAllMedia` no replay — não vazar dado de cliente.
6. **Triagem diária na Semana 1.** Rever issues novos + `/admin/auditoria` + Vercel.
   Registrar riscos novos no `RISK_REGISTER_GOLIVE.md`.
7. **Antes de commitar mudança de risco**, rode `npm run audit:continuous -w pdv-importados`
   para pegar regressão de lint/core sem se afogar nas falhas pré-existentes.
8. **Objetos protegidos** (`finalizar_venda_transacional_canonica_v4`,
   `fn_registrar_comissao`, `trg_registrar_comissao`, `vendas`) — alerta que os
   envolva = **escalonar**, não corrigir sem autorização.

## Validação

- `next build` → compila sem avisos do Sentry (verificado).
- Typecheck do projeto → PASS.
- `audit:continuous` → PASS (sem regressões novas); `clean-cache` testado.

## Backlog (não implementado nesta PR)

- **Validar integração completa Next.js instrumentation → Sentry em ambiente
  controlado.** Teste de framework (register/onRequestError/onRouterTransitionStart
  emitindo eventos reais ao Sentry) exige ambiente controlado com DSN de teste.
  Registrado como backlog — **fora do escopo desta PR** (consolidação anti-regressão,
  sem ampliar escopo funcional).
