# Configuração do Sentry - PDV Importados

## Visão Geral

Este documento descreve a integração do Sentry com o projeto PDV Importados para monitoramento de erros, rastreamento de performance e captura de eventos.

## Status da Implementação

✅ **Completado:**
- Configuração do Next.js com `@sentry/nextjs`
- Arquivos de configuração client-side e server-side
- Client wrapper para inicialização do Sentry
- Arquivo `sentry.properties` para build time

⚠️ **Pendente:**
- Configuração de variáveis de ambiente no Vercel
- Validação e testes em staging

## Arquivos de Configuração

### 1. `sentry.client.config.js`
Configuração para o lado do cliente (navegador):
- **DSN**: `NEXT_PUBLIC_SENTRY_DSN` (público)
- **Taxa de amostragem**: 10% em produção, 100% em desenvolvimento
- **Replays**: Capturados apenas em caso de erro
- **Filtros**: Ignora erros de extensões de browser

### 2. `sentry.server.config.js`
Configuração para o lado do servidor (Node.js):
- **DSN**: `SENTRY_DSN` (privado)
- **Taxa de amostragem**: 10% em produção, 100% em desenvolvimento
- **Filtros**: Ignora erros internos do Next.js (NEXT_NOT_FOUND, NEXT_REDIRECT)

### 3. `sentry.properties`
Arquivo de configuração para o Sentry CLI (upload de source maps):
```properties
defaults.org=damatta-jm
defaults.project=sentry-lime-envelope
auth.token=${SENTRY_AUTH_TOKEN}
```

### 4. `next.config.js`
Configuração do Next.js com Sentry:
- `withSentryConfig()` wrapper
- Hide source maps em produção
- Desabilita automatic Vercel Cron monitors

### 5. `instrumentation.ts`
Inicialização do Sentry server-side:
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
}
```

### 6. `app/providers.tsx` (novo)
Client wrapper que:
- Importa `sentry.client.config.js`
- Fornece acesso ao `ErrorBoundary` do Sentry
- Envolve a aplicação para inicialização automática

## Variáveis de Ambiente

### Desenvolvimento Local

```bash
# .env.local (criar a partir de .env.example)

# Ativar Sentry em desenvolvimento (opcional)
# NEXT_PUBLIC_SENTRY_FORCE_ENABLE=false
# SENTRY_FORCE_ENABLE=false

# DSN client-side (público, seguro)
NEXT_PUBLIC_SENTRY_DSN=https://[seu-dsn]@sentry.io/[projeto-id]

# DSN server-side (privado, apenas servidor)
SENTRY_DSN=https://[seu-dsn]@sentry.io/[projeto-id]
```

### Vercel (Production/Staging)

Configure via **Vercel Dashboard** → **Settings** → **Environment Variables**:

1. **Staging/Preview:**
   ```
   NEXT_PUBLIC_SENTRY_DSN = https://[seu-dsn]@sentry.io/[projeto-id]
   SENTRY_DSN = https://[seu-dsn]@sentry.io/[projeto-id]
   SENTRY_AUTH_TOKEN = [seu-auth-token]
   SENTRY_ORG = damatta-jm
   SENTRY_PROJECT = sentry-lime-envelope
   ```

2. **Production:**
   ```
   NEXT_PUBLIC_SENTRY_DSN = https://[seu-dsn]@sentry.io/[projeto-id]
   SENTRY_DSN = https://[seu-dsn]@sentry.io/[projeto-id]
   SENTRY_AUTH_TOKEN = [seu-auth-token]
   SENTRY_ORG = damatta-jm
   SENTRY_PROJECT = sentry-lime-envelope
   ```

## Como Obter Valores

### 1. DSN (Data Source Name)

1. Acesse [Sentry.io](https://sentry.io)
2. Faça login com sua organização
3. Vá para **Projects** → **sentry-lime-envelope** (ou seu projeto)
4. Clique em **Project Settings** → **Client Keys (DSN)**
5. Copie o DSN completo (exemplo: `https://examplePublicKey@o0.ingest.sentry.io/0`)

### 2. Auth Token

1. Em Sentry, vá para **Organization Settings** → **Auth Tokens**
2. Crie um novo token com escopos:
   - `project:read`
   - `project:write`
   - `release:read`
   - `release:write`
   - `org:read`
3. Copie o token gerado (será exibido uma única vez)

### 3. Valores da Organização e Projeto

- **Organização**: `damatta-jm`
- **Projeto**: `sentry-lime-envelope`

## Deploy e Releases

### No Vercel

Quando você faz push para a branch main ou cria um deployment preview:

1. O Sentry CLI automaticamente:
   - Compila o projeto
   - Gera source maps
   - Faz upload dos source maps (se auth token estiver configurado)
   - Cria um release no Sentry

2. Os erros capturados são associados ao release correto

3. Stack traces mostram código original (não minificado)

### Build Local

```bash
# Build normal
npm run build

# O Sentry CLI faz upload automático (se SENTRY_AUTH_TOKEN estiver definido)
```

## Validação

### 1. Verificar Configuração

```bash
# Verificar se as variáveis estão corretas
npm run env:check
```

### 2. Testar Error Tracking

No navegador (console):
```javascript
// Teste client-side
throw new Error('Teste de erro Sentry')

// Ou acesse uma rota que gera erro proposital
// (se implementada)
```

### 3. Monitorar no Sentry Dashboard

1. Acesse [Sentry.io](https://sentry.io)
2. Vá para **Projects** → **sentry-lime-envelope**
3. Verifique se os erros aparecem em **Issues**
4. Verifique se o release aparece em **Releases**
5. Analise Performance em **Performance**

## Comportamento por Ambiente

| Ambiente | Client DSN | Server DSN | Taxa de Amostragem | Replays |
|----------|-----------|-----------|------------------|---------|
| **Development** | Desativado (a menos que `NEXT_PUBLIC_SENTRY_FORCE_ENABLE=true`) | Desativado | 100% (se ativado) | 0% (nunca) |
| **Staging** | ✅ Ativado | ✅ Ativado | 100% | 100% (erro) |
| **Production** | ✅ Ativado | ✅ Ativado | 10% | 100% (erro) |

## Troubleshooting

### Erro: "Sentry SDK not configured"

**Causa**: Variável `NEXT_PUBLIC_SENTRY_DSN` não definida
**Solução**: Defina `NEXT_PUBLIC_SENTRY_DSN` nas variáveis de ambiente

### Source maps não aparecem

**Causa**: `SENTRY_AUTH_TOKEN` não configurado ou inválido
**Solução**: 
1. Verifique o token no Vercel
2. Confirme permissões do token no Sentry
3. Verifique escopos no Sentry

### Muitos erros sendo capturados

**Causa**: Taxa de amostragem muito alta ou filtros insuficientes
**Solução**:
1. Reduza `tracesSampleRate` em sentry.server.config.js
2. Adicione mais filtros em `beforeSend()`

## Referências

- [Documentação do Sentry para Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Configuração de Release do Sentry](https://docs.sentry.io/product/releases/setup/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Source Maps no Sentry](https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/)

## Próximos Passos

1. ✅ Criar arquivos de configuração (`sentry.client.config.js`, `sentry.server.config.js`)
2. ✅ Criar `sentry.properties` para upload de source maps
3. ✅ Configurar client wrapper (`app/providers.tsx`)
4. 📋 Configurar variáveis de ambiente no Vercel
5. 📋 Fazer deploy para staging
6. 📋 Validar captura de erros e releases no painel do Sentry
7. 📋 Configurar alertas e notificações no Sentry
8. 📋 Documentar runbook para troubleshooting em produção
