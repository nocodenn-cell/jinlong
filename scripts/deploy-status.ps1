# Status Dashboard para Deploy (Abordagem A - Complemento)
# Mostra status atual de todos os componentes em um só lugar

param(
    [Parameter(Mandatory=$false)]
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

# Cores
$Colors = @{
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "Cyan"
    Header = "Magenta"
    Pending = "White"
}

function Write-Status {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Colors[$Color]
}

function Get-EnvironmentStatus {
    param([string]$Env)
    
    $status = @{
        Name = $Env
        WebUrl = ""
        SupabaseLinked = $false
        MigrationsStatus = "Unknown"
        P0Status = "Unknown"
        FunctionsDeployed = @()
        SecretsPresent = @()
        WebDeployed = $false
        DesktopConfigured = $false
        Overall = "Unknown"
    }
    
    # Configurar URLs
    if ($Env -eq "staging") {
        $status.WebUrl = "https://fastproduct-staging.vercel.app"
    } else {
        $status.WebUrl = "https://pdv-importados.vercel.app"
    }
    
    # Verificar link Supabase
    try {
        Set-Location backend
        $linkOutput = npx supabase link --project-ref test 2>&1
        if ($linkOutput -match "already linked|Linked to") {
            $status.SupabaseLinked = $true
        }
    } catch {
        $status.SupabaseLinked = $false
    } finally {
        Set-Location ..
    }
    
    # Verificar migrations
    try {
        Set-Location backend
        $migrationList = npx supabase migration list 2>&1
        if ($migrationList -match "different") {
            $status.MigrationsStatus = "Drift"
        } elseif ($migrationList -match "LOCAL VERSION|REMOTE VERSION") {
            $status.MigrationsStatus = "OK"
        } else {
            $status.MigrationsStatus = "Error"
        }
    } catch {
        $status.MigrationsStatus = "Error"
    } finally {
        Set-Location ..
    }
    
    # Verificar P0 status
    try {
        Set-Location backend
        $p0Result = node scripts/p0-migration-status.mjs 2>&1
        if ($p0Result -match "ALINHADO") {
            $status.P0Status = "OK"
        } elseif ($p0Result -match "DRIFT") {
            $status.P0Status = "Drift"
        } else {
            $status.P0Status = "Error"
        }
    } catch {
        $status.P0Status = "Error"
    } finally {
        Set-Location ..
    }
    
    # Verificar Edge Functions
    $functions = @("sync-outbox", "validar-gerente")
    if ($Env -eq "prod") {
        $functions += "fiscal-worker"
    }
    
    foreach ($func in $functions) {
        $funcPath = "backend\supabase\functions\$func"
        if (Test-Path $funcPath) {
            $status.FunctionsDeployed += $func
        }
    }
    
    # Verificar secrets
    $criticalSecrets = @("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if ($Env -eq "prod") {
        $criticalSecrets += @("SYNC_ENDPOINT", "SYNC_KEY")
    }
    
    foreach ($secret in $criticalSecrets) {
        $value = [System.Environment]::GetEnvironmentVariable($secret)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $status.SecretsPresent += $secret
        }
    }
    
    # Verificar web deploy
    try {
        $response = Invoke-WebRequest -Uri $status.WebUrl -Method HEAD -TimeoutSec 10 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $status.WebDeployed = $true
        }
    } catch {
        $status.WebDeployed = $false
    }
    
    # Verificar desktop (só prod)
    if ($Env -eq "prod") {
        $desktopEnv = "pdv-local\.env"
        if (Test-Path $desktopEnv) {
            $content = Get-Content $desktopEnv
            $syncVars = $content | Where-Object { $_ -match "SYNC_" }
            if ($syncVars.Count -gt 0) {
                $status.DesktopConfigured = $true
            }
        }
    }
    
    # Calcular status geral
    $issues = 0
    if (-not $status.SupabaseLinked) { $issues++ }
    if ($status.MigrationsStatus -ne "OK") { $issues++ }
    if ($status.P0Status -ne "OK") { $issues++ }
    if ($status.FunctionsDeployed.Count -lt 2) { $issues++ }
    if ($status.SecretsPresent.Count -lt $criticalSecrets.Count) { $issues++ }
    if (-not $status.WebDeployed) { $issues++ }
    if ($Env -eq "prod" -and -not $status.DesktopConfigured) { $issues++ }
    
    if ($issues -eq 0) {
        $status.Overall = "Ready"
    } elseif ($issues -le 2) {
        $status.Overall = "Warning"
    } else {
        $status.Overall = "Error"
    }
    
    return $status
}

# Main
Write-Status "========================================" "Header"
Write-Status "  fastproduct - Deploy Status Dashboard" "Header"
Write-Status "  Ambiente: $Environment" "Header"
Write-Status "========================================" "Header"
Write-Host ""

$status = Get-EnvironmentStatus $Environment

# Status geral
$overallColor = switch ($status.Overall) {
    "Ready" { "Success" }
    "Warning" { "Warning" }
    "Error" { "Error" }
    default { "Pending" }
}

Write-Status "STATUS GERAL: $($status.Overall.ToUpper())" $overallColor
Write-Host ""

# Detalhes
Write-Status "COMPONENTES:" "Header"

# Supabase
$linkColor = if ($status.SupabaseLinked) { "Success" } else { "Error" }
Write-Status "  Supabase Link: $(if ($status.SupabaseLinked) { 'OK' } else { 'FALHANDO' })" $linkColor

# Migrations
$migrationColor = switch ($status.MigrationsStatus) {
    "OK" { "Success" }
    "Drift" { "Warning" }
    "Error" { "Error" }
    default { "Pending" }
}
Write-Status "  Migrations: $($status.MigrationsStatus.ToUpper())" $migrationColor

# P0 Status
$p0Color = switch ($status.P0Status) {
    "OK" { "Success" }
    "Drift" { "Warning" }
    "Error" { "Error" }
    default { "Pending" }
}
Write-Status "  P0 Status: $($status.P0Status.ToUpper())" $p0Color

# Edge Functions
$funcColor = if ($status.FunctionsDeployed.Count -ge 2) { "Success" } else { "Warning" }
Write-Status "  Edge Functions: $($status.FunctionsDeployed.Count) deployadas" $funcColor

# Secrets
$secretColor = if ($status.SecretsPresent.Count -ge 2) { "Success" } else { "Error" }
Write-Status "  Secrets: $($status.SecretsPresent.Count)/$($criticalSecrets.Count) presentes" $secretColor

# Web
$webColor = if ($status.WebDeployed) { "Success" } else { "Error" }
Write-Status "  Web Deploy: $(if ($status.WebDeployed) { 'OK' } else { 'FALHANDO' })" $webColor

# Desktop (só prod)
if ($Environment -eq "prod") {
    $desktopColor = if ($status.DesktopConfigured) { "Success" } else { "Warning" }
    Write-Status "  Desktop: $(if ($status.DesktopConfigured) { 'OK' } else { 'NÃO CONFIGURADO' })" $desktopColor
}

Write-Host ""

# URLs
Write-Status "URLS:" "Header"
Write-Status "  Web: $($status.WebUrl)" "Info"
Write-Status "  Studio: http://localhost:54323" "Info"
Write-Status "  API: http://localhost:54321" "Info"
Write-Host ""

# Próximos passos
Write-Status "PRÓXIMOS PASSOS:" "Header"

if ($status.Overall -eq "Ready") {
    Write-Status "  Ambiente pronto para uso!" "Success"
    Write-Status "  Execute testes manuais T11/T12" "Info"
} elseif ($status.Overall -eq "Warning") {
    Write-Status "  Execute o deploy gates para corrigir warnings:" "Warning"
    Write-Status "  .\scripts\deploy-gates.ps1 -Environment $Environment" "Info"
} else {
    Write-Status "  Execute o deploy gates para corrigir erros:" "Error"
    Write-Status "  .\scripts\deploy-gates.ps1 -Environment $Environment" "Info"
}

Write-Host ""

Write-Status "========================================" "Header"
