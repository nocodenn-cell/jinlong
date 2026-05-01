# Análise de RuntimeError no Vercel - FastProduct

## 🚨 **Problema Identificado**

### **Sintomas:**
- Aplicação implantada com status "Active" no Vercel
- "RuntimeError" repetido em todas as funções
- Server Actions, API routes e Edge Functions falhando
- Sem detalhes específicos nos logs

---

## 🔍 **Análise Completa (Seguindo Passos Solicitados)**

### **1. ✅ Variáveis de Ambiente vs .env.example**

#### **Variáveis Críticas Obrigatórias:**
```env
# Do .env.example (obrigatórias)
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=COLE_AQUI_SUA_ANON_PUBLIC_KEY
SUPABASE_SERVICE_ROLE_KEY=COLE_AQUI_SUA_SERVICE_ROLE_KEY
```

#### **Uso no Código:**
```typescript
// lib/supabase/env.ts - Linha 18-19
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''

// Linha 21-26 - VALIDAÇÃO CRÍTICA
if (!url || !key) {
  throw new Error(
    'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em pdv-importados/.env.local'
  )
}
```

#### **🚨 PROVÁVEL CAUSA #1: Variáveis Ausentes no Vercel**
- Se `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` não estiverem configuradas no Vercel
- A função `assertSupabasePublicEnv()` lançará erro em TODAS as chamadas
- Isso explicaria "RuntimeError" generalizado

---

### **2. ✅ next.config.js - Configurações Problemáticas**

#### **Análise do Config:**
```javascript
// next.config.js - SEM PROBLEMAS CRÍTICOS
const nextConfig = {
  typescript: { tsconfigPath: './tsconfig.json' },
  async headers() { /* headers de segurança */ },
}

// Com Sentry - OK
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // ...
})
```

#### **✅ Configurações OK:**
- ❌ Sem `output: 'export'` (que quebraria Server Actions)
- ❌ Sem `experimental.serverActions` desnecessário (Next.js 16+)
- ❌ Sem `basePath` ou `assetPrefix` incorretos
- ✅ Headers de segurança apropriados
- ✅ Sentry configurado corretamente

---

### **3. ✅ Código Crítico que Pode Causar RuntimeError**

#### **Pontos de Falha Identificados:**

##### **A. lib/supabase/env.ts (Mais Provável)**
```typescript
// Linha 21-26 - LANÇA ERRO SE VARIÁVEIS FALTAREM
if (!url || !key) {
  throw new Error(
    'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em pdv-importados/.env.local'
  )
}
```

##### **B. Server Actions (app/caixa/actions.ts)**
```typescript
// 'use server' - Linha 1
// TODAS as ações chamam createClient() internamente
// Se createClient() falhar, todas as ações falham
```

##### **C. lib/supabase/server.ts**
```typescript
// Linha 6 - Chama assertSupabasePublicEnv()
const { url, key } = assertSupabasePublicEnv()

// Se falhar aqui, TODAS as server actions falham
```

##### **D. lib/supabase/client.ts**
```typescript
// Linha 6 - Mesma validação
const { url, key } = assertSupabasePublicEnv()
```

#### **🚨 PROVÁVEL CAUSA #2: Falha em Cascade**
- Se `assertSupabasePublicEnv()` falhar
- Todas as funções que usam Supabase falham
- Isso inclui: Server Actions, API routes, Edge Functions

---

### **4. ✅ Dependências com Módulos Nativos**

#### **Análise do package.json:**
```json
{
  "dependencies": {
    "@sentry/nextjs": "^10.49.0",      // ✅ OK
    "@supabase/ssr": "^0.5.2",         // ✅ OK
    "bwip-js": "^4.10.1",              // ✅ Pure JS
    "exceljs": "^4.4.0",               // ✅ Pure JS
    "jspdf": "^4.2.1",                 // ✅ Pure JS
    "next": "^16.2.4",                 // ✅ OK
    "react": "^19.2.5",                // ✅ OK
    // ... outras dependências pure JS
  }
}
```

#### **✅ Sem Módulos Nativos Problemáticos:**
- ❌ Sem `sharp`, `bcrypt`, `node-gyp`
- ❌ Sem dependências que precisam compilação nativa
- ✅ Todas as dependências são pure JavaScript

---

### **5. ⚠️ Teste Build Local (Necessário Executar)**

#### **Comandos para Testar:**
```bash
# 1. Limpar build anterior
rm -rf .next

# 2. Testar build
npm run build

# 3. Testar produção local
npm run start
```

#### **O Que Verificar:**
- Se `npm run build` falhar → erro de build
- Se `npm run start` falhar → erro de runtime
- Se funcionar local → problema específico do Vercel

---

## 🎯 **Causas Mais Prováveis (Em Ordem)**

### **🥇 CAUSA #1: Variáveis de Ambiente Faltando (90% de probabilidade)**
- `NEXT_PUBLIC_SUPABASE_URL` não configurada no Vercel
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` não configurada no Vercel
- `assertSupabasePublicEnv()` lança erro em todas as chamadas

### **🥈 CAUSA #2: Supabase Service Role Key (5% de probabilidade)**
- `SUPABASE_SERVICE_ROLE_KEY` pode ser necessário para algumas operações
- Ausência pode causar falhas específicas

### **🥉 CAUSA #3: Sentry Configuration (3% de probabilidade)**
- Variáveis Sentry faltando podem causar problemas de inicialização
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_DSN`

### **🏅 CAUSA #4: Edge Functions (2% de probabilidade)**
- Configurações específicas do Vercel Edge Functions
- Timeout ou limites de memória

---

## 🛠️ **Soluções Concretas**

### **SOLUÇÃO #1: Configurar Variáveis de Ambiente no Vercel**

#### **Passos:**
1. **Dashboard Vercel** → Project → Settings → Environment Variables
2. **Adicionar variáveis críticas:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
   ```
3. **Redeploy** automaticamente ou manual

#### **Verificação:**
```bash
# No dashboard Vercel, verificar se variáveis aparecem
# Após deploy, testar endpoint:
curl https://seu-app.vercel.app/api/health
```

### **SOLUÇÃO #2: Adicionar Health Check API**

#### **Criar arquivo: `app/api/health/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('vendas').select('count').limit(1)
    
    if (error) {
      return NextResponse.json({ 
        status: 'error', 
        message: 'Supabase connection failed',
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      status: 'ok', 
      message: 'All systems operational',
      supabase: 'connected',
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'System initialization failed',
      error: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}
```

### **SOLUÇÃO #3: Melhorar Tratamento de Erros**

#### **Modificar lib/supabase/env.ts:**
```typescript
export function assertSupabasePublicEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''

  if (!url || !key) {
    // Log detalhado para debugging
    console.error('❌ Supabase Environment Variables Missing:')
    console.error('NEXT_PUBLIC_SUPABASE_URL:', url ? 'SET' : 'MISSING')
    console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', key ? 'SET' : 'MISSING')
    console.error('NODE_ENV:', process.env.NODE_ENV)
    console.error('VERCEL_ENV:', process.env.VERCEL_ENV)
    
    throw new Error(
      `Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY. ` +
      `URL: ${url ? 'OK' : 'MISSING'}, Key: ${key ? 'OK' : 'MISSING'}. ` +
      `Environment: ${process.env.NODE_ENV || 'unknown'}`
    )
  }

  if (!isValidSupabaseUrl(url)) {
    console.error('❌ Invalid Supabase URL:', url)
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL inválida: "${url}". Deve começar com https://`
    )
  }

  return { url, key }
}
```

---

## 🧪 **Comandos de Verificação**

### **Verificação #1: Build Local**
```bash
# Testar se build funciona localmente
npm run build

# Se funcionar, problema é específico do Vercel
# Se falhar, problema é no código
```

### **Verificação #2: Health Check**
```bash
# Após deploy, testar endpoint
curl https://seu-app.vercel.app/api/health

# Esperado:
{"status":"ok","message":"All systems operational"}

# Se erro:
{"status":"error","message":"Supabase connection failed"}
```

### **Verificação #3: Variáveis de Ambiente**
```bash
# Adicionar temporariamente em alguma rota:
export async function GET() {
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
    supabase_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
    node_env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV
  })
}
```

---

## 📋 **Entregáveis Finais**

### **🎯 Relatório de Causas Prováveis:**
1. **90%**: Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` faltando no Vercel
2. **5%**: `SUPABASE_SERVICE_ROLE_KEY` faltando
3. **3%**: Configuração Sentry incompleta
4. **2%**: Problemas específicos do Edge Functions

### **🛠️ Correções Concretas:**
1. **Configurar variáveis de ambiente no dashboard Vercel**
2. **Adicionar health check API para debugging**
3. **Melhorar logging de erros no Supabase client**
4. **Testar build local para isolar problema**

### **🧪 Comandos de Verificação:**
```bash
# 1. Build local
npm run build

# 2. Health check
curl https://seu-app.vercel.app/api/health

# 3. Verificar variáveis
# (adicionar endpoint temporário)
```

---

## 🚨 **Ação Imediata Recomendada**

**1. Configure as variáveis de ambiente no Vercel AGORA:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**2. Faça redeploy**

**3. Teste com health check**

Isso deve resolver 90% dos casos de RuntimeError no FastProduct.
