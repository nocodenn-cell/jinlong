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

## Validação

- `next build` → compila sem avisos do Sentry (verificado).
- Typecheck do projeto → PASS.
