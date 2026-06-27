# Sentry Integration Checklist - PDV Importados

## ✅ Implementação (Concluída)

- [x] Criar `sentry.client.config.js` com configuração client-side
- [x] Criar `sentry.server.config.js` com configuração server-side
- [x] Criar `sentry.properties` para upload de source maps (Sentry CLI)
- [x] Criar `app/providers.tsx` (Client Component wrapper)
- [x] Integrar `Providers` no `app/layout.tsx`
- [x] Garantir `instrumentation.ts` inicializa server-side
- [x] Documentar setup em `SENTRY_SETUP.md`
- [x] Adicionar variáveis de ambiente em `.env.example` e `.env.production.example`
- [x] Validar sintaxe de todos os arquivos
- [x] Verificar ausência de duplicações em `next.config.js`

## 📋 Configuração no Vercel (Pendente)

### Acesso ao Vercel Dashboard
1. Acesse [vercel.com/dashboard](https://vercel.com/dashboard)
2. Selecione o projeto `fastproduct` (PDV Importados deployment)

### Variáveis de Ambiente para Staging/Preview

1. Vá para **Settings** → **Environment Variables**
2. Adicione as seguintes variáveis para o ambiente **Preview**:

| Variável | Valor | Notas |
|----------|-------|-------|
| `NEXT_PUBLIC_SENTRY_DSN` | `https://[key]@[org].ingest.sentry.io/[id]` | Obtenha em Sentry → Project Settings → Client Keys |
| `SENTRY_DSN` | `https://[key]@[org].ingest.sentry.io/[id]` | Pode ser o mesmo do client DSN |
| `SENTRY_AUTH_TOKEN` | `sntrys_[token]` | Crie em Sentry → Org Settings → Auth Tokens |
| `SENTRY_ORG` | `damatta-jm` | Seu slug da organização |
| `SENTRY_PROJECT` | `sentry-lime-envelope` | Seu slug do projeto |

### Variáveis de Ambiente para Production

1. Selecione o ambiente **Production**
2. Adicione as mesmas variáveis acima

## 🔑 Como Obter as Credenciais do Sentry

### 1. DSN (Data Source Name)

**Passo a passo:**
1. Acesse https://sentry.io
2. Vá para **Projects** (lado esquerdo)
3. Clique em **sentry-lime-envelope** (seu projeto)
4. Clique em **Settings** (engrenagem)
5. Clique em **Client Keys (DSN)** no menu esquerdo
6. Copie a URL DSN exibida

**Exemplo:** `https://abc123def456@ghi789.ingest.sentry.io/1234567`

### 2. Auth Token

**Passo a passo:**
1. Em Sentry, clique na **organização** (canto inferior esquerdo)
2. Vá para **Settings** → **Auth Tokens**
3. Clique em **Create New Token**
4. Selecione os escopos (mínimo necessário):
   - `project:read`
   - `project:write`
   - `release:read`
   - `release:write`
   - `org:read`
5. Clique em **Create Token**
6. **Copie o token imediatamente** (aparece apenas uma vez)

**Formato:** Começa com `sntrys_`

### 3. Organização e Projeto

- **Organização**: `damatta-jm` (você pode confirmar em Sentry → Settings → Organization)
- **Projeto**: `sentry-lime-envelope`

## 🚀 Deploy e Validação

### 1. Deploy para Staging (Preview)

```bash
git push origin claude/sentry-integration-setup-pxq14y
```

Vercel automaticamente:
- Detecta a configuração do Sentry em `next.config.js`
- Executa o Sentry CLI durante o build (se `SENTRY_AUTH_TOKEN` estiver configurado)
- Faz upload de source maps
- Cria um release no Sentry

### 2. Validar no Painel do Sentry

Acesse https://sentry.io/organizations/damatta-jm/issues/?project=sentry-lime-envelope

**O que verificar:**

- [ ] **Releases**: Vá para **Releases** e confirme se uma nova release aparece com data/hora recente
- [ ] **Issues**: Vá para **Issues** e procure por erros da sua aplicação
- [ ] **Health**: Vá para **Health** e veja estatísticas de erros
- [ ] **Performance**: Vá para **Performance** e veja transações (traces)

### 3. Gerar um Erro de Teste (Opcional)

Se quiser testar manualmente:

**Client-side (abra no navegador):**
```javascript
// No console do navegador (F12)
throw new Error('Teste de erro Sentry')
```

**Server-side (no terminal):**
```bash
# Criar uma rota de teste que lance um erro
# Exemplo: acesse /api/test-sentry-error
```

Após 10-30 segundos, o erro deve aparecer em **Issues** no painel do Sentry.

## 📝 Arquivos Criados/Modificados

### Novos
- ✅ `sentry.properties` - Configuração do Sentry CLI
- ✅ `app/providers.tsx` - Client wrapper
- ✅ `SENTRY_SETUP.md` - Documentação completa
- ✅ `SENTRY_CHECKLIST.md` - Este arquivo

### Modificados
- ✅ `.env.example` - Adicionadas variáveis do Sentry
- ✅ `.env.production.example` - Adicionadas variáveis do Sentry
- ✅ `app/layout.tsx` - Integrado `Providers`

### Inalterados (Pré-existentes)
- ✅ `sentry.client.config.js` - Já existia
- ✅ `sentry.server.config.js` - Já existia
- ✅ `next.config.js` - Já estava configurado com `withSentryConfig`
- ✅ `instrumentation.ts` - Já estava configurado

## 🔍 Validação de Sintaxe

Todos os arquivos foram validados:

```
✅ next.config.js - Sintaxe correta, sem duplicações
✅ sentry.client.config.js - Sintaxe correta
✅ sentry.server.config.js - Sintaxe correta
✅ app/providers.tsx - TypeScript válido
✅ app/layout.tsx - TypeScript válido
✅ instrumentation.ts - TypeScript válido
```

## 🐛 Troubleshooting

### Problema: "Sentry SDK not initialized"
**Solução:** Verifique se `NEXT_PUBLIC_SENTRY_DSN` está configurado no Vercel

### Problema: Source maps não aparecem
**Solução:** 
- Verifique se `SENTRY_AUTH_TOKEN` está configurado no Vercel
- Verifique os escopos do token no Sentry
- Confira se `SENTRY_ORG` e `SENTRY_PROJECT` estão corretos

### Problema: Muitos erros sendo capturados
**Solução:** Reduza `tracesSampleRate` de 1.0 para 0.1 em produção (já feito no código)

## 📚 Referências

- [Sentry + Next.js Guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Release Management](https://docs.sentry.io/product/releases/)
- [Source Maps Configuration](https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)

## ✨ Próximas Etapas (Ordem)

1. **Obter credenciais do Sentry** (5 min)
   - [ ] DSN
   - [ ] Auth Token
   - [ ] Org slug
   - [ ] Project slug

2. **Configurar Vercel** (5 min)
   - [ ] Adicionar variáveis em Preview
   - [ ] Adicionar variáveis em Production

3. **Deploy para Staging** (2 min)
   - [ ] Push da branch
   - [ ] Esperar build no Vercel

4. **Validar no Sentry** (5 min)
   - [ ] Confirmar nova release
   - [ ] Verificar painel de Issues
   - [ ] Gerar erro de teste (opcional)

5. **Deploy para Produção** (2 min)
   - [ ] Merge para main
   - [ ] Deploy automático no Vercel

**Tempo total estimado: 20 minutos** ⏱️

---

**Status**: ✅ **PRONTO PARA DEPLOY**

A implementação está concluída. Apenas aguardando configuração das variáveis de ambiente no Vercel.
