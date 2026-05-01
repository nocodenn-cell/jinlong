# 🚀 Deploy do Frontend FastProduct para Vercel

## 📋 **Pré-requisitos**

### **1. Variáveis de Ambiente Configuradas**
✅ Já configuradas no Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_NAME`
- `USE_UNIFIED_SALES_FLOW`
- `STRICT_MANAGER_DISCOUNT_AUTH`

### **2. Build Funcionando Localmente**
```bash
npm run build
npm run start
```

---

## 🚀 **Método 1: Vercel CLI (Recomendado)**

### **Instalação do Vercel CLI:**
```bash
npm install -g vercel
```

### **Login no Vercel:**
```bash
vercel login
```

### **Deploy:**
```bash
cd c:\Naturecode\fastproduct\pdv-importados
vercel --prod
```

---

## 🚀 **Método 2: GitHub Integration (Automático)**

### **Configurar:**
1. **Dashboard Vercel** → Add New Project
2. **Import Git Repository**
3. **Conectar ao repositório FastProduct**
4. **Configurar Build Settings:**
   - **Framework Preset:** Next.js
   - **Root Directory:** `pdv-importados`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
   - **Install Command:** `npm install`

### **Deploy Automático:**
- Push para `main` → Deploy automático
- Pull requests → Preview deployments

---

## 🚀 **Método 3: Drag & Drop (Rápido)**

### **Passos:**
1. **Dashboard Vercel** → Add New Project
2. **Upload Folder** → Arrastar pasta `pdv-importados`
3. **Configurar** → Vercel detecta Next.js automaticamente
4. **Deploy** → Aguardar build

---

## ⚙️ **Configurações de Build**

### **Package.json Scripts:**
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

### **Next.js Config:**
```javascript
// next.config.js - Já configurado
const nextConfig = {
  typescript: { tsconfigPath: './tsconfig.json' },
  async headers() { /* headers de segurança */ },
}
```

---

## 🔧 **Build Command Otimizado**

### **Para Produção:**
```bash
npm run build
```

### **Verificação de Build:**
```bash
# Verificar se não há erros
npm run build

# Testar produção local
npm run start
```

---

## 📊 **Performance e Otimização**

### **Otimizações já implementadas:**
- ✅ Next.js 15 com App Router
- ✅ TypeScript estrito
- ✅ Headers de segurança
- ✅ Sentry para monitoramento
- ✅ Imagens otimizadas
- ✅ Code splitting automático

### **Variáveis de Performance:**
```bash
# Opcional: Configurar no Vercel
NEXT_PUBLIC_DEBUG_MODE=false
NEXT_PUBLIC_IDLE_LOGOUT_MINUTES=0
```

---

## 🔍 **Validação Pós-Deploy**

### **1. Health Check:**
```bash
curl https://fastproduct.vercel.app/api/health
```

### **2. Funcionalidades Críticas:**
- ✅ Login/carregamento
- ✅ Dashboard do caixa
- ✅ Busca de produtos
- ✅ Finalização de venda
- ✅ Dashboard do gerente

### **3. Performance:**
- ✅ Lighthouse score > 90
- ✅ Tempo de carregamento < 3s
- ✅ Sem erros no console

---

## 🚨 **Troubleshooting Comum**

### **Erro 1: Build falha**
```bash
# Limpar cache
rm -rf .next
npm run build
```

### **Erro 2: Variáveis não encontradas**
```bash
# Verificar no dashboard Vercel
# Project → Settings → Environment Variables
```

### **Erro 3: Server Actions falham**
```bash
# Verificar variáveis Supabase
# Testar health check
```

---

## 📋 **Checklist Final**

### **Antes do Deploy:**
- [ ] Build funciona localmente
- [ ] Variáveis configuradas no Vercel
- [ ] Branch correta selecionada
- [ ] Sem segredos no código

### **Após o Deploy:**
- [ ] Aplicação carrega em produção
- [ ] Health check retorna "ok"
- [ ] Funcionalidades críticas funcionam
- [ ] Logs sem erros

---

## 🎯 **Comando Final**

### **Deploy Imediato:**
```bash
cd c:\Naturecode\fastproduct\pdv-importados
vercel --prod
```

### **Ou via GitHub:**
```bash
git add .
git commit -m "Deploy frontend FastProduct"
git push origin main
```

---

## 🏆 **Resultado Esperado**

### **URL de Produção:**
```
https://fastproduct.vercel.app
```

### **Features Ativas:**
- 🚀 **Performance otimizada**
- 🛡️ **Segurança garantida**
- 🔄 **Server Actions funcionando**
- 📊 **Dashboard operacional**
- 📱 **Interface responsiva**

---

## 📞 **Suporte**

### **Se algo falhar:**
1. **Verificar logs** no dashboard Vercel
2. **Testar health check** API
3. **Validar variáveis** de ambiente
4. **Verificar build** local

---

## 🎉 **Deploy Realizado!**

**Com as variáveis de ambiente já configuradas, o deploy deve funcionar perfeitamente!**

**Execute o comando de deploy e me diga o resultado!** 🚀
