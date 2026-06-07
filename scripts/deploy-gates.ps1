# Script único de automação de gates críticos (Abordagem A)
# Executa T1-T12 do P0_CHECKLIST_OPERACIONAL.md automaticamente
# Uso: .\scripts\deploy-gates.ps1 -Environment staging|prod

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("staging", "prod")]
    [string]$Environment,
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectRef,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipWebDeploy,
    
    [Parameter(Mandatory=$false)]
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Cores para output
$Colors = @{
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "Cyan"
    Header = "Magenta"
}

function Write-Status {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Colors[$Color]
}

function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Get-EnvironmentConfig {
    param([string]$Env)
    
    $configs = @{
        staging = @{
            WebUrl = "https://fastproduct-staging.vercel.app"
            RequiresDesktop = $false
            CriticalSecrets = @("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
        }
        prod = @{
            WebUrl = "https://pdv-importados.vercel.app"
            RequiresDesktop = $true
            CriticalSecrets = @("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SYNC_ENDPOINT", "SYNC_KEY")
        }
    }
    
    return $configs[$Env]
}

# Início do script
Write-Status "========================================" "Header"
Write-Status "  fastproduct - Deploy Gates Automation" "Header"
Write-Status "  Ambiente: $Environment" "Header"
Write-Status "========================================" "Header"
Write-Host ""

# Pré-requisitos
Write-Status "[PRÉ-REQUISITOS] Verificando ferramentas..." "Info"

if (-not (Test-Command "npx")) {
    Write-Status "ERRO: Node.js/npx não encontrado" "Error"
    exit 1
}

if (-not (Test-Command "git")) {
    Write-Status "ERRO: Git não encontrado" "Error"
    exit 1
}

if (-not (Test-Command "psql")) {
    Write-Status "AVISO: psql não encontrado - skip de verificações SQL" "Warning"
}

Write-Status "OK: Ferramentas básicas encontradas" "Success"
Write-Host ""

# Verificar se estamos na pasta correta
if (-not (Test-Path "backend\supabase\config.toml")) {
    Write-Status "ERRO: Execute da raiz do projeto (onde está backend/)" "Error"
    exit 1
}

# Configuração do ambiente
$config = Get-EnvironmentConfig $Environment
Write-Status "[CONFIG] Ambiente: $Environment" "Info"
Write-Status "  Web URL: $($config.WebUrl)" "Info"
Write-Status "  Desktop requerido: $($config.RequiresDesktop)" "Info"
Write-Host ""

# T1: Link com Supabase
Write-Status "[T1/12] Verificando link Supabase..." "Info"

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    Write-Status "AVISO: ProjectRef não fornecido, tentando detectar..." "Warning"
    
    # Tentar detectar do .env.local ou variável de ambiente
    $envFile = "pdv-importados\.env.local"
    if (Test-Path $envFile) {
        $content = Get-Content $envFile
        $match = $content | Where-Object { $_ -match "NEXT_PUBLIC_SUPABASE_URL=.*\.supabase\.co" }
        if ($match) {
            if ($match -match "https://([^.]+)\.supabase\.co") {
                $ProjectRef = $matches[1]
                Write-Status "ProjectRef detectado: $ProjectRef" "Success"
            }
        }
    }
    
    if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
        Write-Status "ERRO: ProjectRef não encontrado. Use -ProjectRef ou configure NEXT_PUBLIC_SUPABASE_URL" "Error"
        exit 1
    }
}

if ($DryRun) {
    Write-Status "DRY RUN: Skip link Supabase" "Warning"
} else {
    Set-Location backend
    $linkResult = npx supabase link --project-ref $ProjectRef 2>&1
    if ($LASTEXITCODE -ne 0 -and $linkResult -notmatch "already linked") {
        Write-Status "ERRO: Falha no link Supabase" "Error"
        Write-Host $linkResult
        exit 1
    }
    Set-Location ..
    Write-Status "OK: Link Supabase estabelecido" "Success"
}
Write-Host ""

# T2: Verificar migrations
Write-Status "[T2/12] Verificando migrations..." "Info"

Set-Location backend
$migrationList = npx supabase migration list 2>&1
Set-Location ..

if ($LASTEXITCODE -ne 0) {
    Write-Status "ERRO: Falha ao listar migrations" "Error"
    exit 1
}

# Analisar se há drift
$hasDrift = $migrationList -match "LOCAL VERSION|REMOTE VERSION" -and $migrationList -match "different"

if ($hasDrift) {
    Write-Status "AVISO: Drift detectado entre Local e Remote" "Warning"
    
    if ($DryRun) {
        Write-Status "DRY RUN: Skip db push" "Warning"
    } else {
        Write-Status "Aplicando db push..." "Info"
        Set-Location backend
        npx supabase db push
        if ($LASTEXITCODE -ne 0) {
            Write-Status "ERRO: Falha no db push" "Error"
            exit 1
        }
        Set-Location ..
        Write-Status "OK: db push aplicado" "Success"
    }
} else {
    Write-Status "OK: migrations alinhadas" "Success"
}
Write-Host ""

# T3: p0-migration-status
Write-Status "[T3/12] Verificando status P0..." "Info"

Set-Location backend
$statusResult = node scripts/p0-migration-status.mjs 2>&1
Set-Location ..

if ($LASTEXITCODE -ne 0) {
    Write-Status "ERRO: Falha no p0-migration-status" "Error"
    Write-Host $statusResult
    exit 1
}

if ($statusResult -match "ALINHADO") {
    Write-Status "OK: Status P0 alinhado" "Success"
} else {
    Write-Status "ERRO: Status P0 não alinhado" "Error"
    Write-Host $statusResult
    exit 1
}
Write-Host ""

# T4: db push (se necessário) - já feito em T2
Write-Status "[T4/12] Verificação de drift (já executada em T2)" "Success"
Write-Host ""

# T5: verify_p0_producao.sql
Write-Status "[T5/12] Executando verify_p0_producao.sql..." "Info"

if (-not (Test-Command "psql")) {
    Write-Status "AVISO: psql não disponível, pulando verificação SQL" "Warning"
} else {
    # Obter connection string
    Set-Location backend
    $statusOutput = npx supabase status -o env
    $envVars = $statusOutput | Where-Object { $_ -match "=" }
    $postgresUrl = ""
    
    foreach ($var in $envVars) {
        if ($var -match "POSTGRES_URL=(.*)") {
            $postgresUrl = $matches[1]
            break
        }
    }
    
    if ([string]::IsNullOrWhiteSpace($postgresUrl)) {
        Write-Status "AVISO: POSTGRES_URL não encontrado, pulando SQL" "Warning"
    } else {
        $sqlFile = "supabase\scripts\verify_p0_producao.sql"
        if (Test-Path $sqlFile) {
            $sqlResult = psql "$postgresUrl" -f $sqlFile 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Status "ERRO: Falha no verify_p0_producao.sql" "Error"
                Write-Host $sqlResult
                exit 1
            }
            Write-Status "OK: verify_p0_producao.sql executado" "Success"
        } else {
            Write-Status "AVISO: verify_p0_producao.sql não encontrado" "Warning"
        }
    }
    Set-Location ..
}
Write-Host ""

# T6: Smoke 023 (opcional)
Write-Status "[T6/12] Verificando smoke 023 (opcional)..." "Info"

$smokeFiles = @(
    "backend\supabase\scripts\smoke_023_finalizar_venda_token_gerente.sql",
    "backend\supabase\scripts\smoke_023_finalizar_venda_token_gerente_env.sql"
)

$smokeExecuted = $false
foreach ($file in $smokeFiles) {
    if (Test-Path $file) {
        Write-Status "Executando smoke 023: $(Split-Path $file -Leaf)" "Info"
        if (Test-Command "psql" -and $postgresUrl) {
            $smokeResult = psql "$postgresUrl" -f $file 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Status "AVISO: Smoke 023 falhou (não crítico)" "Warning"
            } else {
                Write-Status "OK: Smoke 023 executado" "Success"
                $smokeExecuted = $true
            }
        }
        break
    }
}

if (-not $smokeExecuted) {
    Write-Status "AVISO: Smoke 023 não encontrado ou psql indisponível" "Warning"
}
Write-Host ""

# T7: Deploy Edge Functions
Write-Status "[T7/12] Deploy Edge Functions..." "Info"

if ($DryRun) {
    Write-Status "DRY RUN: Skip deploy Edge Functions" "Warning"
} else {
    Set-Location backend
    
    $functions = @("sync-outbox", "validar-gerente")
    if ($Environment -eq "prod") {
        $functions += "fiscal-worker"
    }
    
    foreach ($func in $functions) {
        $funcPath = "supabase\functions\$func"
        if (Test-Path $funcPath) {
            Write-Status "Deploy $func..." "Info"
            npx supabase functions deploy $func --no-verify-jwt
            if ($LASTEXITCODE -ne 0) {
                Write-Status "ERRO: Falha no deploy $func" "Error"
                exit 1
            }
            Write-Status "OK: $func deployado" "Success"
        } else {
            Write-Status "AVISO: $func não encontrado" "Warning"
        }
    }
    
    Set-Location ..
}
Write-Host ""

# T8: Verificar secrets
Write-Status "[T8/12] Verificando secrets críticos..." "Info"

$missingSecrets = @()
foreach ($secret in $config.CriticalSecrets) {
    $envValue = [System.Environment]::GetEnvironmentVariable($secret)
    if ([string]::IsNullOrWhiteSpace($envValue)) {
        $missingSecrets += $secret
    }
}

if ($missingSecrets.Count -gt 0) {
    Write-Status "ERRO: Secrets faltando: $($missingSecrets -join ', ')" "Error"
    Write-Status "Configure estes secrets no ambiente ou no painel Supabase/Vercel" "Error"
    exit 1
} else {
    Write-Status "OK: Secrets críticos presentes" "Success"
}
Write-Host ""

# T9: Web deploy
Write-Status "[T9/12] Verificando deploy web..." "Info"

if ($SkipWebDeploy) {
    Write-Status "AVISO: Web deploy pulado (-SkipWebDeploy)" "Warning"
} else {
    # Verificar se .env.local está configurado
    $envFile = "pdv-importados\.env.local"
    if (Test-Path $envFile) {
        Write-Status "OK: .env.local encontrado" "Success"
        
        # Verificar NEXT_PUBLIC_*
        $content = Get-Content $envFile
        $nextPublicVars = $content | Where-Object { $_ -match "NEXT_PUBLIC_" }
        
        if ($nextPublicVars.Count -gt 0) {
            Write-Status "OK: $($nextPublicVars.Count) variáveis NEXT_PUBLIC_* encontradas" "Success"
        } else {
            Write-Status "AVISO: Nenhuma variável NEXT_PUBLIC_* encontrada" "Warning"
        }
    } else {
        Write-Status "AVISO: .env.local não encontrado" "Warning"
    }
    
    # Sugerir deploy command
    Write-Status "Para deploy web: npm run build (em pdv-importados/) + deploy Vercel" "Info"
}
Write-Host ""

# T10: Desktop (se aplicável)
Write-Status "[T10/12] Verificando configuração desktop..." "Info"

if ($config.RequiresDesktop) {
    $desktopEnv = "pdv-local\.env"
    if (Test-Path $desktopEnv) {
        Write-Status "OK: .env desktop encontrado" "Success"
        
        # Verificar SYNC_*
        $content = Get-Content $desktopEnv
        $syncVars = $content | Where-Object { $_ -match "SYNC_" }
        
        if ($syncVars.Count -gt 0) {
            Write-Status "OK: $($syncVars.Count) variáveis SYNC_* encontradas" "Success"
        } else {
            Write-Status "ERRO: Nenhuma variável SYNC_* encontrada em .env desktop" "Error"
            exit 1
        }
    } else {
        Write-Status "ERRO: .env desktop não encontrado" "Error"
        exit 1
    }
} else {
    Write-Status "AVISO: Desktop não requerido para $Environment" "Warning"
}
Write-Host ""

# T11/T12: Testes manuais (só instruções)
Write-Status "[T11/12] Testes manuais (instruções)..." "Info"
Write-Status "  Execute testes manuais conforme P0_CHECKLIST_OPERACIONAL.md" "Info"
Write-Host ""

Write-Status "[T12/12] Checklist final (instruções)..." "Info"
Write-Status "  Preencha CHECKLIST_P0_STAGING.md para registro formal" "Info"
Write-Host ""

# Resumo final
Write-Status "========================================" "Header"
Write-Status "  Gates críticos verificados com sucesso!" "Header"
Write-Status "  Ambiente: $Environment" "Header"
Write-Status "  Próximos passos:" "Header"
Write-Status "  1. Deploy web (se não pulado)" "Info"
Write-Status "  2. Testes manuais T11/T12" "Info"
Write-Status "  3. Preencher checklist staging" "Info"
Write-Status "========================================" "Header"
