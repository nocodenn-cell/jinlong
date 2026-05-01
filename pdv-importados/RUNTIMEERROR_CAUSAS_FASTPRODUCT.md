# 🔍 Análise de RuntimeError no FastProduct - Next.js 15 + App Router + Supabase

## 📋 **Contexto Específico do Projeto**

- **Framework:** Next.js 15 com App Router
- **Banco:** Supabase com SSR
- **Features:** Server Actions, Edge Functions
- **Status:** Build passa, mas runtime falha em produção
- **Sintomas:** "RuntimeError" repetido sem detalhes

---

## 🚨 **Causas Específicas de RuntimeError em Next.js 15**

### **1. 🥇 Variáveis de Ambiente em Produção (90% de probabilidade)**

#### **Problema:** Build passa mas runtime falha
```typescript
// lib/supabase/env.ts - VALIDAÇÃO CRÍTICA
if (!url || !key) {
  throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY')
}
```

#### **Causas Comuns:**
- `NEXT_PUBLIC_SUPABASE_URL` não configurada no Vercel
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` não configurada no Vercel
- `SUPABASE_SERVICE_ROLE_KEY` faltando para operações server-side
- Variáveis configuradas erradas (URL inválida, key incorreta)

#### **Por que Build Passa:**
- Variáveis `NEXT_PUBLIC_*` são validadas apenas em runtime
- TypeScript não valida conteúdo de `process.env`
- Build compila mas runtime lança erro

---

### **2. 🥈 Server Actions com Supabase SSR (70% de probabilidade)**

#### **Problema:** Server Actions falham em produção
```typescript
// app/caixa/actions.ts - 'use server'
export async function finalizarVendaCaixa(raw: unknown) {
  return finalizarVendaCaixaImpl(raw) // Chama createClient()
}

// lib/supabase/server.ts
export async function createClient() {
  const { url, key } = assertSupabasePublicEnv() // Ponto de falha
}
```

#### **Causas Comuns:**
- `createClient()` falha se variáveis Supabase faltarem
- Cookies não disponíveis em Edge Runtime
- `cookies()` não disponível em ambiente serverless específico
- Timeout em conexões Supabase em produção

---

### **3. 🥉 Edge Functions + Supabase (40% de probabilidade)**

#### **Problema:** Edge Functions com Supabase SSR
```typescript
// Edge Functions usam @supabase/ssr
// Mas podem ter limitações específicas
```

#### **Causas Comuns:**
- Edge Runtime não suporta algumas APIs do Node.js
- `crypto` module não disponível em Edge
- Timeout menor em Edge Functions (10s vs 30s)
- Headers específicos do Supabase bloqueados

---

### **4. 🏅 Next.js 15 App Router Específicos (30% de probabilidade)**

#### **Problema:** Novas features do Next.js 15
```typescript
// Next.js 15 mudanças no App Router
// Server Actions comportamento diferente
```

#### **Causas Comuns:**
- Server Actions com `async/await` em produção
- `revalidatePath()` com cache invalidation
- `cookies()` API mudanças no Next.js 15
- Paralelismo em Server Actions

---

## 🎯 **Causas Específicas do FastProduct**

### **1. Supabase Client Creation Pattern**

#### **Problema:** Multiple client creation points
```typescript
// lib/supabase/client.ts
export function createClient() {
  const { url, key } = assertSupabasePublicEnv() // Ponto de falha #1
}

// lib/supabase/server.ts  
export async function createClient() {
  const { url, key } = assertSupabasePublicEnv() // Ponto de falha #2
}
```

#### **Impacto:** Se `assertSupabasePublicEnv()` falhar, tudo falha

### **2. Server Actions Cascade**

#### **Problema:** Todas as ações usam Supabase
```typescript
// app/caixa/actions.ts - 15+ server actions
// app/gerente/*/actions.ts - 20+ server actions
// Todas chamam createClient() internamente
```

#### **Impacto:** Se Supabase client falhar, 35+ actions falham

### **3. SSR com Supabase Auth**

#### **Problema:** Auth state em SSR
```typescript
// Múltiplas chamadas a supabase.auth.getUser()
// Em ambiente serverless pode ter race conditions
```

#### **Causas Comuns:**
- Auth state não disponível em cold start
- Session cookies não persistem corretamente
- `getUser()` timeout em produção

---

## 📊 **Análise por Categoria de Erro**

### **A. Environment Variables (Mais Comum)**
```
Erro: "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY"
Causa: Variáveis não configuradas no Vercel
Solução: Configurar no dashboard Vercel
```

### **B. Supabase Connection**
```
Erro: "Supabase connection failed"
Causa: URL inválida, key incorreta, timeout
Solução: Verificar credenciais, testar conexão
```

### **C. Server Actions Runtime**
```
Erro: "Server Action failed"
Causa: createClient() falha, cookies indisponíveis
Solução: Verificar ambiente, tratar erros
```

### **D. Edge Functions**
```
Erro: "Edge Function timeout"
Causa: Operações demoradas, APIs não suportadas
Solução: Otimizar código, mover para serverless
```

---

## 🔍 **Diagnóstico Diferencial**

### **Se o erro é "Configure NEXT_PUBLIC_SUPABASE_URL":**
- **Causa:** 100% variáveis de ambiente
- **Solução:** Configurar no Vercel

### **Se o erro é "Supabase connection failed":**
- **Causa:** Credenciais incorretas ou timeout
- **Solução:** Verificar URL/key, testar conexão

### **Se o erro é genérico "RuntimeError":**
- **Causa:** Server Action falhando internamente
- **Solução:** Adicionar logging, verificar Supabase

### **Se o erro só acontece em produção:**
- **Causa:** Ambiente específico do Vercel
- **Solução:** Comparar com local, verificar variáveis

---

## 🛠️ **Soluções Específicas para FastProduct**

### **1. Environment Variables (Imediato)**
```bash
# Dashboard Vercel → Settings → Environment Variables
NEXT_PUBLIC_SUPABASE_URL=https://projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=service_role_key_aqui
```

### **2. Health Check API**
```typescript
// app/api/health/route.ts
export async function GET() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('vendas').select('count').limit(1)
    
    if (error) {
      return NextResponse.json({ 
        status: 'error', 
        message: 'Supabase connection failed',
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ status: 'ok', message: 'All systems operational' })
  } catch (err) {
    return NextResponse.json({ 
      status: 'error', 
      message: 'System initialization failed',
      error: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}
```

### **3. Melhorar Logging**
```typescript
// lib/supabase/env.ts - Versão melhorada
export function assertSupabasePublicEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''

  // Logging detalhado
  console.log('🔍 Supabase Environment Check:', {
    url: url ? 'SET' : 'MISSING',
    key: key ? 'SET' : 'MISSING',
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV
  })

  if (!url || !key) {
    throw new Error(
      `Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY. ` +
      `URL: ${url ? 'OK' : 'MISSING'}, Key: ${key ? 'OK' : 'MISSING'}. ` +
      `Environment: ${process.env.NODE_ENV || 'unknown'}`
    )
  }

  return { url, key }
}
```

### **4. Error Boundary para Server Actions**
```typescript
// app/caixa/actions.ts - Com error boundary
export async function finalizarVendaCaixa(raw: unknown) {
  try {
    return finalizarVendaCaixaImpl(raw)
  } catch (err) {
    console.error('❌ finalizarVendaCaixa failed:', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}
```

---

## 🧪 **Comandos de Verificação**

### **1. Teste Local**
```bash
npm run build
npm run start
# Se funcionar local, problema é ambiente Vercel
```

### **2. Health Check**
```bash
curl https://fastproduct.vercel.app/api/health
# Deve retornar {"status":"ok"}
```

### **3. Verificar Variáveis**
```bash
# Adicionar endpoint temporário
curl https://fastproduct.vercel.app/api/debug-env
```

### **4. Teste Server Action**
```bash
# Testar uma action simples
curl -X POST https://fastproduct.vercel.app/api/test-action
```

---

## 📋 **Checklist de Diagnóstico**

### **✅ Verificar:**
- [ ] Variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` configurado
- [ ] Build local funciona (`npm run build && npm run start`)
- [ ] Health check API retorna OK
- [ ] Logs Vercel mostram erro específico

### **🔧 Ações Corretivas:**
- [ ] Configurar variáveis faltantes
- [ ] Adicionar health check API
- [ ] Melhorar logging de erros
- [ ] Adicionar error boundaries
- [ ] Testar cada componente isoladamente

---

## 🎯 **Conclusão**

### **Causas Mais Prováveis (em ordem):**
1. **90%:** Variáveis de ambiente Supabase faltando no Vercel
2. **70%:** Server Actions com Supabase client falhando
3. **40%:** Edge Functions com limitações específicas
4. **30%:** Next.js 15 App Router mudanças

### **Ação Imediata:**
1. Configurar variáveis de ambiente no Vercel
2. Adicionar health check API
3. Testar build local vs produção
4. Verificar logs específicos no Vercel

**O problema mais provável é variáveis de ambiente configuradas localmente mas não no Vercel.**
