/**
 * Shim: a implementação única do logger vive em `shared/unified-logger.ts` (raiz do monorepo),
 * também consumida pelo desktop (`pdv-local`) e pelas Edge Functions (via `shared/logger.ts`).
 * Mantido para os importadores `@/shared/unified-logger` da web. Remover quando não houver importadores.
 */
export * from '@shared/unified-logger'
