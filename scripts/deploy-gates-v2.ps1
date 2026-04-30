# Deploy Gates Automation v2
# Script completo de deploy com verificação de ambiente, secrets e deploy automático
# Uso: .\scripts\deploy-gates-v2.ps1 -Environment staging|prod

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
    Step = "White"
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
            SecretsFile = ".env.supabase.staging"
            Functions = @("sync-outbox", "validar-gerente")
            VercelCommand = "npx vercel deploy --prebuilt"
        }
        prod = @{
            WebUrl = "https://fastproduct.vercel.app"
            SecretsFile = ".env.supabase.prod"
            Functions = @("sync-outbox", "validar-gerente", "fiscal-worker")
            VercelCommand = "npx vercel deploy --prod"
        }
    }
    
    return $configs[$Env]
}

# Status tracking
$deployStatus = @{
    Environment = $Environment
    StartTime = Get-Date
    Steps = @()
    Success = $false
    Errors = @()
}

function Add-Step {
    param([string]$Name, [string]$Status, [string]$Message = "")
    
    $step = @{
        Name = $Name
        Status = $Status
        Message = $Message
        Timestamp = Get-Date
    }
    
    $deployStatus.Steps += $step
    
    if ($Status -eq "Error") {
        $deployStatus.Errors += $Message
    }
}

function Save-DeployStatus {
    $statusFile = ".deploy-status.json"
    $deployStatus.EndTime = Get-Date
    $deployStatus.Duration = ($deployStatus.EndTime - $deployStatus.StartTime).TotalSeconds
    $deployStatus.Success = $deployStatus.Errors.Count -eq 0
    
    $deployStatus | ConvertTo-Json -Depth 10 | Out-File -FilePath $statusFile -Encoding UTF8
    Write-Status "Status salvo em $statusFile" "Info"
}

# Início do script
Write-Status "========================================" "Header"
Write-Status "  Deploy Gates Automation v2" "Header"
Write-Status "  Ambiente: $Environment" "Header"
Write-Status "========================================" "Header"
Write-Host ""

# Pré-requisitos
Write-Status "[PRÉ-REQUISITOS] Verificando ferramentas..." "Step"

if (-not (Test-Command "npx")) {
    Write-Status "ERRO: Node.js/npx não encontrado" "Error"
    Add-Step "Pré-requisitos" "Error" "Node.js/npx não encontrado"
    Save-DeployStatus
    exit 1
}

if (-not (Test-Command "git")) {
    Write-Status "ERRO: Git não encontrado" "Error"
    Add-Step "Pré-requisitos" "Error" "Git não encontrado"
    Save-DeployStatus
    exit 1
}

Write-Status "OK: Ferramentas básicas encontradas" "Success"
Add-Step "Pré-requisitos" "Success" "Ferramentas verificadas"
Write-Host ""

# Configuração do ambiente
$config = Get-EnvironmentConfig $Environment
Write-Status "[CONFIG] Ambiente: $Environment" "Step"
Write-Status "  Web URL: $($config.WebUrl)" "Info"
Write-Status "  Secrets: $($config.SecretsFile)" "Info"
Write-Status "  Functions: $($config.Functions -join ', ')" "Info"
Write-Host ""

# 1. Verificar Supabase CLI
Write-Status "[1/7] Verificando Supabase CLI..." "Step"

try {
    $supabaseVersion = npx supabase --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Supabase CLI não disponível"
    }
    Write-Status "OK: Supabase CLI $($supabaseVersion)" "Success"
    Add-Step "Supabase CLI" "Success" "Versão $($supabaseVersion)"
} catch {
    Write-Status "ERRO: Supabase CLI não encontrado" "Error"
    Add-Step "Supabase CLI" "Error" "CLI não encontrado"
    Save-DeployStatus
    exit 1
}
Write-Host ""

# 2. Supabase Link
Write-Status "[2/7] Conectando ao Supabase..." "Step"

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    # Tentar detectar de variável de ambiente
    $envVar = "SUPABASE_PROJECTREF_$($Environment.ToUpper())"
    $ProjectRef = [System.Environment]::GetEnvironmentVariable($envVar)
    
    if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
        Write-Status "ERRO: ProjectRef não encontrado. Use -ProjectRef ou defina SUPABASE_PROJECTREF_$($Environment.ToUpper())" "Error"
        Add-Step "Supabase Link" "Error" "ProjectRef não encontrado"
        Save-DeployStatus
        exit 1
    }
}

if ($DryRun) {
    Write-Status "DRY RUN: Skip Supabase link" "Warning"
    Add-Step "Supabase Link" "Warning" "Dry run - pulado"
} else {
    try {
        Set-Location backend
        $linkResult = npx supabase link --project-ref $ProjectRef 2>&1
        if ($LASTEXITCODE -ne 0 -and $linkResult -notmatch "already linked") {
            throw "Falha no link: $linkResult"
        }
        Set-Location ..
        Write-Status "OK: Conectado ao projeto $ProjectRef" "Success"
        Add-Step "Supabase Link" "Success" "Conectado a $ProjectRef"
    } catch {
        Write-Status "ERRO: Falha ao conectar ao Supabase" "Error"
        Write-Host $_.Exception.Message
        Add-Step "Supabase Link" "Error" $_.Exception.Message
        Save-DeployStatus
        exit 1
    }
}
Write-Host ""

# 3. Aplicar migrations
Write-Status "[3/7] Aplicando migrations..." "Step"

if ($DryRun) {
    Write-Status "DRY RUN: Skip migrations" "Warning"
    Add-Step "Migrations" "Warning" "Dry run - pulado"
} else {
    try {
        Set-Location backend
        Write-Host "Executando: npx supabase db push --include-all" -ForegroundColor $Colors.Info
        $pushResult = npx supabase db push --include-all 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Falha no db push: $pushResult"
        }
        Set-Location ..
        Write-Status "OK: Migrations aplicadas" "Success"
        Add-Step "Migrations" "Success" "Migrations aplicadas com --include-all"
    } catch {
        Write-Status "ERRO: Falha ao aplicar migrations" "Error"
        Write-Host $_.Exception.Message
        Add-Step "Migrations" "Error" $_.Exception.Message
        Save-DeployStatus
        exit 1
    }
}
Write-Host ""

# 4. Configurar secrets
Write-Status "[4/7] Configurando secrets..." "Step"

$secretsFile = $config.SecretsFile
if (-not (Test-Path $secretsFile)) {
    Write-Status "AVISO: Arquivo $secretsFile não encontrado" "Warning"
    Add-Step "Secrets" "Warning" "Arquivo $secretsFile não encontrado"
} else {
    if ($DryRun) {
        Write-Status "DRY RUN: Skip secrets" "Warning"
        Add-Step "Secrets" "Warning" "Dry run - pulado"
    } else {
        try {
            Set-Location backend
            Write-Host "Executando: npx supabase secrets set --env-file $secretsFile" -ForegroundColor $Colors.Info
            $secretsResult = npx supabase secrets set --env-file $secretsFile 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "Falha ao configurar secrets: $secretsResult"
            }
            Set-Location ..
            Write-Status "OK: Secrets configurados" "Success"
            Add-Step "Secrets" "Success" "Secrets de $secretsFile aplicados"
        } catch {
            Write-Status "ERRO: Falha ao configurar secrets" "Error"
            Write-Host $_.Exception.Message
            Add-Step "Secrets" "Error" $_.Exception.Message
            Save-DeployStatus
            exit 1
        }
    }
}
Write-Host ""

# 5. Deploy Edge Functions
Write-Status "[5/7] Deploy Edge Functions..." "Step"

if ($DryRun) {
    Write-Status "DRY RUN: Skip Edge Functions" "Warning"
    Add-Step "Edge Functions" "Warning" "Dry run - pulado"
} else {
    try {
        Set-Location backend
        foreach ($func in $config.Functions) {
            $funcPath = "supabase\functions\$func"
            if (Test-Path $funcPath) {
                Write-Host "Deploy $func..." -ForegroundColor $Colors.Info
                $deployResult = npx supabase functions deploy $func --no-verify-jwt 2>&1
                if ($LASTEXITCODE -ne 0) {
                    throw "Falha no deploy $func`: $deployResult"
                }
                Write-Status "OK: $func deployado" "Success"
            } else {
                Write-Status "AVISO: $func não encontrado" "Warning"
            }
        }
        Set-Location ..
        Add-Step "Edge Functions" "Success" "$($config.Functions.Count) functions deployadas"
    } catch {
        Write-Status "ERRO: Falha no deploy Edge Functions" "Error"
        Write-Host $_.Exception.Message
        Add-Step "Edge Functions" "Error" $_.Exception.Message
        Save-DeployStatus
        exit 1
    }
}
Write-Host ""

# 6. Deploy Web
Write-Status "[6/7] Deploy Web..." "Step"

if ($SkipWebDeploy) {
    Write-Status "AVISO: Web deploy pulado (-SkipWebDeploy)" "Warning"
    Add-Step "Web Deploy" "Warning" "Pulado via -SkipWebDeploy"
} elseif ($DryRun) {
    Write-Status "DRY RUN: Skip web deploy" "Warning"
    Add-Step "Web Deploy" "Warning" "Dry run - pulado"
} else {
    try {
        Set-Location pdv-importados
        Write-Host "Executando: $($config.VercelCommand)" -ForegroundColor $Colors.Info
        $deployResult = Invoke-Expression $config.VercelCommand 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Falha no deploy web: $deployResult"
        }
        Set-Location ..
        Write-Status "OK: Web deploy concluído" "Success"
        Add-Step "Web Deploy" "Success" "Deploy via $($config.VercelCommand)"
    } catch {
        Write-Status "ERRO: Falha no deploy web" "Error"
        Write-Host $_.Exception.Message
        Add-Step "Web Deploy" "Error" $_.Exception.Message
        Save-DeployStatus
        exit 1
    }
}
Write-Host ""

# 7. Verificação final
Write-Status "[7/7] Verificação final..." "Step"

try {
    $response = Invoke-WebRequest -Uri $config.WebUrl -Method HEAD -TimeoutSec 10 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Status "OK: Web está acessível em $($config.WebUrl)" "Success"
        Add-Step "Verificação Final" "Success" "Web acessível em $($config.WebUrl)"
    } else {
        throw "Web retornou status $($response.StatusCode)"
    }
} catch {
    Write-Status "AVISO: Web não acessível (pode ainda estar deployando)" "Warning"
    Add-Step "Verificação Final" "Warning" "Web não acessível - pode estar em deploy"
}
Write-Host ""

# Resumo final
Save-DeployStatus

Write-Status "========================================" "Header"
if ($deployStatus.Success) {
    Write-Status "  DEPLOY CONCLUÍDO COM SUCESSO!" "Success"
} else {
    Write-Status "  DEPLOY FALHOU!" "Error"
}
Write-Status "  Ambiente: $Environment" "Header"
Write-Status "  Duração: $([math]::Round($deployStatus.Duration, 2))s" "Info"
Write-Status "  Status salvo em .deploy-status.json" "Info"
Write-Status "========================================" "Header"

# Exibir erros se houver
if ($deployStatus.Errors.Count -gt 0) {
    Write-Host ""
    Write-Status "ERROS ENCONTRADOS:" "Error"
    foreach ($errorMessage in $deployStatus.Errors) {
        Write-Status "  - $errorMessage" "Error"
    }
}

exit $(if ($deployStatus.Success) { 0 } else { 1 })
