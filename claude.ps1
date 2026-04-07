$env:ANTHROPIC_BASE_URL = "http://localhost:11434"
$env:ANTHROPIC_AUTH_TOKEN = "ollama"

Write-Host "🚀 Iniciando Claude Code com qwen2.5-coder:3b" -ForegroundColor Green
Write-Host "Modelo: qwen2.5-coder:3b | RAM: 8GB mode" -ForegroundColor Cyan

claude --model qwen2.5-coder:3b
