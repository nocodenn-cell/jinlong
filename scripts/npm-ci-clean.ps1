# Reinstala dependências do monorepo sem o env inválido `npm_config_devdir` (injetado por alguns IDEs).
param(
  [Parameter(Mandatory = $false)]
  [string]$Workspace = ""
)

$ErrorActionPreference = "Stop"
Remove-Item Env:npm_config_devdir -ErrorAction SilentlyContinue

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  if ($Workspace) {
    Write-Host "[npm-ci-clean] npm ci (workspace: $Workspace)"
    npm ci -w $Workspace --ignore-scripts
  }
  else {
    Write-Host "[npm-ci-clean] npm ci (raiz — todos os workspaces)"
    npm ci --ignore-scripts
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "[npm-ci-clean] OK"
}
finally {
  Pop-Location
}
