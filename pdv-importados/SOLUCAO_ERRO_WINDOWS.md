# 🚨 Solução: Erro ao Executar Scripts no Windows

## 📋 **Problema Identificado**

### **Erro Comum:**
```bash
# No PowerShell/Command Prompt
./EXECUTAR_MIGRATIONS_COMPLETAS.sh

# Erro: "O sistema não pode encontrar o caminho especificado"
# ou "export: not recognized"
```

---

## 🔍 **Causas do Problema**

### **1. Scripts .sh não funcionam no Windows**
- Windows não reconhece scripts Bash nativamente
- `export` é comando Unix/Linux
- `./` não funciona no Command Prompt

### **2. Variáveis de ambiente diferentes**
- Unix/Linux: `export VAR=value`
- Windows: `set VAR=value` ou `$env:VAR="value"`

### **3. Executáveis diferentes**
- Unix/Linux: `./script.sh`
- Windows: `script.bat` ou `.\script.ps1`

---

## 🛠️ **Soluções Imediatas**

### **Opção 1: Usar Scripts .bat (Recomendado)**
```batch
# 1. Configurar DATABASE_URL
set DATABASE_URL=postgresql://user:password@host:port/database

# 2. Executar script Windows
EXECUTAR_MIGRATIONS_COMPLETAS.bat
```

### **Opção 2: PowerShell com Scripts .bat**
```powershell
# 1. Configurar DATABASE_URL
$env:DATABASE_URL="postgresql://user:password@host:port/database"

# 2. Executar script Windows
.\EXECUTAR_MIGRATIONS_COMPLETAS.bat
```

### **Opção 3: Git Bash (se instalado)**
```bash
# 1. Abrir Git Bash
# 2. Configurar DATABASE_URL
export DATABASE_URL="postgresql://user:password@host:port/database"

# 3. Executar script original
./EXECUTAR_MIGRATIONS_COMPLETAS.sh
```

---

## 📁 **Arquivos Disponíveis**

### **Scripts Windows (.bat) - PRONTOS PARA USAR**
```
📁 Scripts para Windows
├── EXECUTAR_MIGRATIONS_COMPLETAS.bat      # Execução normal
└── EXECUTAR_MIGRATIONS_SEGURANCO.bat      # Com backup e validações
```

### **Scripts Linux (.sh) - PARA REFERÊNCIA**
```
📁 Scripts para Linux/Unix
├── EXECUTAR_MIGRATIONS_COMPLETAS.sh        # Bash/Linux
└── EXECUTAR_MIGRATIONS_SEGURANCO.sh        # Bash/Linux
```

---

## 🚀 **Como Resolver Agora**

### **Passo 1: Verificar qual script usar**
```batch
# Se estiver no Command Prompt ou PowerShell
# Use os arquivos .bat

# Se tiver Git Bash instalado
# Pode usar os arquivos .sh
```

### **Passo 2: Configurar DATABASE_URL**

#### **Command Prompt:**
```batch
set DATABASE_URL=postgresql://usuario:senha@host:porta:banco
```

#### **PowerShell:**
```powershell
$env:DATABASE_URL="postgresql://usuario:senha@host:porta:banco"
```

### **Passo 3: Executar script correto**

#### **Execução Normal:**
```batch
EXECUTAR_MIGRATIONS_COMPLETAS.bat
```

#### **Execução Segura (Recomendado):**
```batch
EXECUTAR_MIGRATIONS_SEGURANCO.bat
```

---

## 🔧 **Solução de Problemas Específicos**

### **Problema: "psql não é reconhecido"**
```batch
# Adicionar PostgreSQL ao PATH
set PATH=%PATH%;C:\Program Files\PostgreSQL\15\bin

# Ou usar caminho completo
"C:\Program Files\PostgreSQL\15\bin\psql.exe" "%DATABASE_URL%" -f "arquivo.sql"
```

### **Problema: "Acesso negado"**
```batch
# Executar como Administrador
# Ou verificar permissões da pasta
```

### **Problema: "Arquivo não encontrado"**
```batch
# Verificar se está na pasta correta
dir supabase\migrations\

# Verificar se PostgreSQL está instalado
psql --version
```

---

## 📊 **Teste de Conexão**

### **Verificar se psql funciona:**
```batch
# Testar conexão
psql "%DATABASE_URL%" -c "SELECT version();"
```

### **Se funcionar, executar migrations:**
```batch
EXECUTAR_MIGRATIONS_COMPLETAS.bat
```

---

## 🎯 **Exemplo Completo**

### **No Command Prompt:**
```batch
C:\Naturecode\fastproduct\pdv-importados> set DATABASE_URL=postgresql://postgres:senha@localhost:5432/pdv_db

C:\Naturecode\fastproduct\pdv-importados> EXECUTAR_MIGRATIONS_COMPLETAS.bat

🚀 EXECUÇÃO DAS MIGRATIONS DO PDV DRAGON POS - WINDOWS
=========================================================
✅ Todos os arquivos encontrados
🚀 EXECUTANDO MIGRATIONS EM ORDEM...
✅ 1. Feature Flags - EXECUTADO COM SUCESSO
✅ 2. Performance - EXECUTADO COM SUCESSO
✅ 3. Segurança - EXECUTADO COM SUCESSO
✅ 4. Robustez - EXECUTADO COM SUCESSO
🎉 TODAS AS MIGRATIONS EXECUTADAS COM SUCESSO!
```

---

## 🏆 **Resumo da Solução**

### **Problema:** Scripts .sh não funcionam no Windows
### **Solução:** Usar scripts .bat criados especificamente

### **Comandos Corretos:**
```batch
# ❌ ERRADO (não funciona no Windows)
export DATABASE_URL="conexao"
./EXECUTAR_MIGRATIONS_COMPLETAS.sh

# ✅ CORRETO (funciona no Windows)
set DATABASE_URL=postgresql://user:pass@host:port/db
EXECUTAR_MIGRATIONS_COMPLETAS.bat
```

---

## 🚨 **Se Ainda Não Funcionar**

### **Verificar:**
1. **PostgreSQL está instalado?**
   ```batch
   psql --version
   ```

2. **DATABASE_URL está correto?**
   ```batch
   echo %DATABASE_URL%
   ```

3. **Scripts .bat existem?**
   ```batch
   dir EXECUTAR_*.bat
   ```

4. **Permissões adequadas?**
   ```batch
   # Executar como Administrador se necessário
   ```

---

**Use os scripts .bat! Eles foram criados especificamente para resolver os problemas de compatibilidade com Windows.** 🚀
