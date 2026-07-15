# 📋 Checklist de Variáveis de Ambiente - Vercel FastProduct

## 🚨 **VARIÁVEIS OBRIGATÓRIAS EM PRODUÇÃO**

### **🔥 CRÍTICAS (Se faltarem, aplicação não funciona)**

#### **1. Supabase Core (OBRIGATÓRIO)**
```
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_ANON_PUBLIC_KEY
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
```

**📍 Onde são usadas:**
- `lib/supabase/env.ts` - Linha 18-19 (assertSupabasePublicEnv)
- `lib/supabase/server.ts` - Linha 6 (createClient)
- `lib/supabase/client.ts` - Linha 6 (createClient)
- `app/auth/signout/route.ts` - Linha 10 (signout)

**⚠️ Impacto se faltarem:**
- **100% RuntimeError** em todas as Server Actions
- App carrega mas todas as funcionalidades falham
- Erro: "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY"

---

### **🛡️ SEGURANÇA E SESSÃO**

#### **2. Timeout de Sessão (Opcional mas recomendado)**
```
NEXT_PUBLIC_IDLE_LOGOUT_MINUTES=0
```

**📍 Onde é usada:**
- Componentes de sessão (idle timeout)

**⚠️ Impacto se faltar:**
- Sem logout automático por inatividade
- Funcionalidade normal continua

---

### **🏷️ IDENTIFICAÇÃO E LOCALIZAÇÃO**

#### **3. App Info (Obrigatório para UI)**
```
NEXT_PUBLIC_APP_NAME=PDV Importados
NEXT_PUBLIC_DEFAULT_LANG=pt
NEXT_PUBLIC_ADMIN_CHINESE_UI=true
```

**📍 Onde são usadas:**
- Layout e componentes UI
- Internacionalização
- Admin panel

**⚠️ Impacto se faltarem:**
- UI com valores padrão
- Textos podem não aparecer corretamente

#### **4. Terminal ID (Opcional)**
```
NEXT_PUBLIC_TERMINAL_ID=MATRIZ-CAIXA-01
```

**📍 Onde é usada:**
- Identificação de PDV específico

**⚠️ Impacto se faltar:**
- Sem identificação de terminal

---

### **🧾 MÓDULO FISCAL (EDGE FUNCTIONS)**

#### **5. Fiscal Worker (OBRIGATÓRIO se usar fiscal)**
```
FISCAL_WORKER_ENDPOINT=https://SEU_PROJECT_REF.supabase.co/functions/v1/fiscal-worker
FISCAL_WORKER_KEY=COLE_UM_SEGREDO_FORTE_AQUI
AUTO_ENQUEUE_FISCAL_ON_SALE=true
FISCAL_DEFAULT_DOC_TYPE=NFC_E_STUB
```

**📍 Onde são usadas:**
- `app/caixa/server/caixaVendas.impl.ts` (flag `p_fiscal_auto_enqueue` passada à RPC de venda)
- RPC `finalizar_venda_transacional_canonica_v4` (enfileira `fiscal_enfileirar_documento_venda` internamente, na mesma transação)

**⚠️ Impacto se faltarem:**
- Documentos fiscais não enfileirados
- Venda finaliza mas não gera fiscal

---

### **🔄 FUNCIONALIDADES (FLAGS)**

#### **6. Flags de Vendas (OBRIGATÓRIO para operação)**
```
USE_UNIFIED_SALES_FLOW=true
STRICT_MANAGER_DISCOUNT_AUTH=true
```

**📍 Onde são usadas:**
- Server Actions de vendas
- Validação de descontos

**⚠️ Impacto se faltarem:**
- Funcionalidades desativadas
- Fluxo de vendas pode não funcionar

#### **7. Debug (Opcional)**
```
NEXT_PUBLIC_DEBUG_MODE=false
```

**📍 Onde é usada:**
- Console logs em desenvolvimento

**⚠️ Impacto se faltar:**
- Sem logs de debug (recomendado false em produção)

---

### **💰 CÂMBIO (Opcional)**

#### **8. Câmbio USD/BRL (Opcional)**
```
CAMBIO_USD_BRL_FALLBACK=5.55
NEXT_PUBLIC_CAMBIO_USD_BRL_FALLBACK=5.55
```

**📍 Onde são usadas:**
- `app/caixa/server/caixaCambioServer.ts` - Linha 5

**⚠️ Impacto se faltar:**
- Sem fallback de câmbio
- Usa API Frankfurter (se funcionar)

---

### **📊 RELATÓRIOS (Opcional)**

#### **9. Timezone e Metas (Opcional)**
```
RELATORIO_TIMEZONE=America/Sao_Paulo
GERENTE_DASHBOARD_META_DIA_JSON={"default":2000}
```

**📍 Onde são usadas:**
- Relatórios do gerente
- Dashboard de metas

**⚠️ Impacto se faltarem:**
- Relatórios com timezone padrão
- Sem metas configuradas

---

## 🎯 **CHECKLIST PARA PAINEL VERCEL**

### **✅ ETAPA 1: Configurar Variáveis Críticas**

#### **Acessar:**
1. Dashboard Vercel → Project → Settings → Environment Variables
2. Add New Variable para cada uma abaixo

#### **Variáveis OBRIGATÓRIAS:**
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

#### **Variáveis RECOMENDADAS:**
- [ ] `NEXT_PUBLIC_APP_NAME`
- [ ] `NEXT_PUBLIC_DEFAULT_LANG`
- [ ] `NEXT_PUBLIC_ADMIN_CHINESE_UI`
- [ ] `USE_UNIFIED_SALES_FLOW`
- [ ] `STRICT_MANAGER_DISCOUNT_AUTH`

#### **Variáveis FISCAIS (se usar):**
- [ ] `FISCAL_WORKER_ENDPOINT`
- [ ] `FISCAL_WORKER_KEY`
- [ ] `AUTO_ENQUEUE_FISCAL_ON_SALE`
- [ ] `FISCAL_DEFAULT_DOC_TYPE`

#### **Variáveis OPCIONAIS:**
- [ ] `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES`
- [ ] `NEXT_PUBLIC_TERMINAL_ID`
- [ ] `NEXT_PUBLIC_DEBUG_MODE`
- [ ] `CAMBIO_USD_BRL_FALLBACK`
- [ ] `RELATORIO_TIMEZONE`
- [ ] `GERENTE_DASHBOARD_META_DIA_JSON`
- [ ] `NEXT_PUBLIC_CAIXA_PDV_LAYOUT` (definir como `classic` **apenas** em Preview/staging para homologação visual do `/caixa`; a UI mostra aviso de pré-visualização; **não** em Production até decisão explícita)

---

### **Preview / staging — layout PDV (opcional)**

Para o cliente validar o visual antes da **Fase B** (carrinho + barra inferior): no dashboard Vercel do projeto de homologação (ex.: deploy associado a `fastproduct-staging` ou branch de preview), em **Settings → Environment Variables**, adicione `NEXT_PUBLIC_CAIXA_PDV_LAYOUT` = `classic` para o ambiente **Preview** (ou o environment group usado em staging), faça **redeploy**, e abra `/caixa`. O aviso no ecrã deixa claro que é layout opcional em pré-visualização.

---

### **✅ ETAPA 2: Validar Configuração**

#### **Verificar no Dashboard:**
- [ ] Todas as variáveis aparecem na lista
- [ ] Nenhuma variável tem "Value required"
- [ ] Ambientes corretos (Production, Preview, Development)

#### **Testar Health Check:**
```bash
curl https://pdv-importados.vercel.app/api/health
```

#### **Expected Response:**
```json
{
  "status": "ok",
  "message": "All systems operational"
}
```

---

### **✅ ETAPA 3: Verificar Funcionalidades**

#### **Testar Server Actions:**
- [ ] Login funciona
- [ ] Busca de produtos
- [ ] Finalização de venda
- [ ] Dashboard do caixa

#### **Testar Edge Functions (se configurado):**
- [ ] Enfileiramento fiscal
- [ ] Validação de gerente

---

## 🚨 **PROBLEMAS COMUNS E SOLUÇÕES**

### **Problema 1: "Configure NEXT_PUBLIC_SUPABASE_URL"**
**Causa:** Variáveis Supabase faltando
**Solução:** Configurar as 3 variáveis críticas

### **Problema 2: "Fiscal worker failed"**
**Causa:** Variáveis fiscais faltando
**Solução:** Configurar FISCAL_WORKER_ENDPOINT e FISCAL_WORKER_KEY

### **Problema 3: "Server Action failed"**
**Causa:** Flags de funcionalidade faltando
**Solução:** Configurar USE_UNIFIED_SALES_FLOW e STRICT_MANAGER_DISCOUNT_AUTH

### **Problema 4: "UI texts missing"**
**Causa:** Variáveis de UI faltando
**Solução:** Configurar NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_DEFAULT_LANG

---

## 📋 **RESUMO RÁPIDO**

### **🔥 MÍNIMO OBRIGATÓRIO (3 variáveis):**
```
NEXT_PUBLIC_SUPABASE_URL=https://projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon_key
SUPABASE_SERVICE_ROLE_KEY=service_role_key
```

### **🛡️ RECOMENDADO (7 variáveis):**
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_NAME=PDV Importados
NEXT_PUBLIC_DEFAULT_LANG=pt
USE_UNIFIED_SALES_FLOW=true
STRICT_MANAGER_DISCOUNT_AUTH=true
```

### **🧾 COMPLETO (15+ variáveis):**
Incluir todas as variáveis opcionais para funcionalidade completa.

---

## 🎯 **AÇÃO IMEDIATA**

1. **Configure as 3 variáveis críticas no Vercel**
2. **Faça redeploy**
3. **Teste health check**
4. **Adicione variáveis recomendadas conforme necessário**

**Com as 3 variáveis críticas configuradas, o RuntimeError deve ser resolvido!** 🚀
