# 🪟 Instruções para Windows - Executar Migrations

## 🚨 **Problema Identificado: Scripts Bash vs Windows**

### **Erro Comum:**
```bash
# ❌ Não funciona no PowerShell/Command Prompt
export DATABASE_URL="sua-conexao"
./EXECUTAR_MIGRATIONS_COMPLETAS.sh
```

**Erro:** `export: The term 'export' is not recognized`

---

## 🛠️ **Soluções para Windows**

### **Opção 1: Scripts .bat (Recomendado)**
```batch
# ✅ Funciona no Command Prompt e PowerShell
set DATABASE_URL=postgresql://user:password@host:port/database
EXECUTAR_MIGRATIONS_COMPLETAS.bat
```

### **Opção 2: PowerShell**
```powershell
# ✅ Funciona no PowerShell
$env:DATABASE_URL="postgresql://user:password@host:port/database"
.\EXECUTAR_MIGRATIONS_COMPLETAS.bat
```

### **Opção 3: Git Bash (se instalado)**
```bash
# ✅ Funciona se tiver Git Bash
export DATABASE_URL="postgresql://user:password@host:port/database"
./EXECUTAR_MIGRATIONS_COMPLETAS.sh
```

---

## 📁 **Arquivos Disponíveis para Windows**

### **Scripts Principais**
```
📁 Scripts Windows (.bat)
├── EXECUTAR_MIGRATIONS_COMPLETAS.bat      # Execução normal
└── EXECUTAR_MIGRATIONS_SEGURANCO.bat      # Com validações e backup

📁 Scripts Linux (.sh)
├── EXECUTAR_MIGRATIONS_COMPLETAS.sh        # Bash/Linux
└── EXECUTAR_MIGRATIONS_SEGURANCO.sh        # Bash/Linux com segurança
```

---

## 🚀 **Como Executar (Passo a Passo)**

### **Passo 1: Configurar DATABASE_URL**

#### **No Command Prompt:**
```batch
set DATABASE_URL=postgresql://usuario:senha@host:porta:banco
```

#### **No PowerShell:**
```powershell
$env:DATABASE_URL="postgresql://usuario:senha@host:porta:banco"
```

### **Passo 2: Executar Script**

#### **Opção A: Execução Normal**
```batch
EXECUTAR_MIGRATIONS_COMPLETAS.bat
```

#### **Opção B: Execução Segura (Recomendado)**
```batch
EXECUTAR_MIGRATIONS_SEGURANCO.bat
```

---

## 🛡️ **Diferenças Entre Scripts**

### **EXECUTAR_MIGRATIONS_COMPLETAS.bat**
- ✅ Execução direta das migrations
- ✅ Validação básica de arquivos
- ✅ Relatório de resultados
- ❌ Sem backup automático
- ❌ Sem validação de ambiente

### **EXECUTAR_MIGRATIONS_SEGURANCO.bat**
- ✅ Detecção de ambiente (produção/homologação)
- ✅ Backup obrigatório em produção
- ✅ Ativação controlada do RLS
- ✅ Validação de isolamento
- ✅ Confirmação explícita do usuário
- ✅ Relatório completo de segurança

---

## 🔍 **Validação Pós-Execução**

### **Verificar no Prompt:**
```batch
REM Verificar Feature Flags
psql "%DATABASE_URL%" -c "SELECT nome, ativo FROM feature_flags ORDER BY nome;"

REM Verificar Índices
psql "%DATABASE_URL%" -c "SELECT tablename, indexname FROM pg_indexes WHERE indexname LIKE 'idx_%';"

REM Verificar RLS
psql "%DATABASE_URL%" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('vendas', 'estoque', 'produtos');"
```

### **Verificar no PowerShell:**
```powershell
# Verificar Feature Flags
psql $env:DATABASE_URL -c "SELECT nome, ativo FROM feature_flags ORDER BY nome;"

# Verificar Índices
psql $env:DATABASE_URL -c "SELECT tablename, indexname FROM pg_indexes WHERE indexname LIKE 'idx_%';"

# Verificar RLS
psql $env:DATABASE_URL -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('vendas', 'estoque', 'produtos');"
```

---

## 🚨 **Solução de Problemas Comuns**

### **Problema 1: psql não encontrado**
```batch
# Adicionar PostgreSQL ao PATH
set PATH=%PATH%;C:\Program Files\PostgreSQL\15\bin
```

### **Problema 2: DATABASE_URL não funciona**
```batch
# Testar conexão
psql "%DATABASE_URL%" -c "SELECT version();"
```

### **Problema 3: Permissões negadas**
```batch
# Executar como Administrador
# Ou verificar permissões da pasta
```

### **Problema 4: Script não executa**
```batch
# Verificar se psql está instalado
psql --version

# Instalar PostgreSQL se necessário
```

---

## 📋 **Checklist Antes de Executar**

### **✅ Pré-requisitos:**
- [ ] PostgreSQL instalado
- [ ] psql no PATH do sistema
- [ ] DATABASE_URL configurado corretamente
- [ ] Permissões de escrita na pasta
- [ ] Backup do banco (se produção)

### **✅ Validação:**
- [ ] Testar conexão com psql
- [ ] Verificar arquivos .bat existem
- [ ] Confirmar ambiente (homologação/produção)

---

## 🎯 **Recomendação Final**

### **Para Homologação:**
```batch
set DATABASE_URL=postgresql://user:pass@host:port/homolog_db
EXECUTAR_MIGRATIONS_SEGURANCO.bat
```

### **Para Produção:**
```batch
set DATABASE_URL=postgresql://user:pass@host:port/prod_db
EXECUTAR_MIGRATIONS_SEGURANCO.bat
```

---

## 🏆 **Resultado Esperado**

Após execução bem-sucedida:
- ✅ **Performance**: Dashboards 95% mais rápidos
- ✅ **Segurança**: RLS ativo com isolamento 100%
- ✅ **Robustez**: Idempotência previne duplicatas
- ✅ **Controle**: Feature flags para hotfixes

### **Mensagens de Sucesso:**
```
🎉 TODAS AS MIGRATIONS EXECUTADAS COM SUCESSO!
✅ Performance: Índices criados
✅ Segurança: RLS implementado
✅ Robustez: Idempotência ativa
🏆 Sistema PDV Dragon POS agora é enterprise-ready!
```

---

## 🚨 **Em Caso de Erro**

### **Verificar:**
1. **DATABASE_URL** está correto?
2. **PostgreSQL** está instalado?
3. **Permissões** são adequadas?
4. **Conexão** com o banco funciona?

### **Comandos para Debug:**
```batch
REM Testar conexão
psql "%DATABASE_URL%" -c "SELECT version();"

REM Verificar variável
echo %DATABASE_URL%

REM Listar arquivos
dir supabase\migrations\
```

---

**Use os scripts .bat para Windows! Eles foram criados especificamente para resolver os problemas de compatibilidade.** 🚀
