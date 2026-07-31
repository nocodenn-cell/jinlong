/**
 * OBSOLETO — conteúdo migrado para `instrumentation-client.ts`.
 *
 * Este arquivo ficou intencionalmente SEM `Sentry.init` em vez de ser apagado de
 * imediato. Motivo: o webpack plugin do @sentry/nextjs casa tanto
 * `sentry.client.config.js` quanto `instrumentation-client.ts`:
 *
 *   /(?:sentry\.client\.config\.(jsx?|tsx?)|(?:src[\/])?instrumentation-client\.(js|ts))$/
 *
 * Se os dois tivessem `Sentry.init`, o SDK inicializaria duas vezes no browser e
 * geraria eventos duplicados. Sem init aqui, a coexistência é inofensiva.
 *
 * REMOVER no próximo passo de limpeza:
 *   git rm pdv-importados/sentry.client.config.js
 *
 * Não reintroduzir `Sentry.init` neste arquivo: o nome deixa de funcionar sob
 * Turbopack (DEPRECATION WARNING do próprio SDK). Ver o cabeçalho de
 * instrumentation-client.ts.
 */

export {}
