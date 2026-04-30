@echo off
REM Script de desenvolvimento simplificado para fastproduct
REM Verifica Docker, sobe Supabase local e aplica migrations

setlocal enabledelayedexpansion

echo ========================================
echo   fastproduct - Ambiente de Desenvolvimento
echo ========================================
echo.

REM Verificar Docker
echo [1/4] Verificando Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERRO: Docker nao esta instalado ou nao esta no PATH
    echo   Instale Docker Desktop: https://www.docker.com/products/docker-desktop
    exit /b 1
)
echo   OK: Docker encontrado
docker --version
echo.

REM Verificar se Docker Desktop esta rodando
echo [2/4] Verificando se Docker Desktop esta rodando...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERRO: Docker Desktop nao esta rodando
    echo   Inicie o Docker Desktop e tente novamente
    exit /b 1
)
echo   OK: Docker Desktop esta rodando
echo.

REM Verificar se Supabase CLI esta instalado
echo [3/4] Verificando Supabase CLI...
npx supabase --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERRO: Supabase CLI nao esta disponivel via npx
    echo   Verifique se Node.js esta instalado e tente novamente
    exit /b 1
)
echo   OK: Supabase CLI disponivel
npx supabase --version
echo.

REM Navegar para pasta backend
cd /d "%~dp0backend"
if %errorlevel% neq 0 (
    echo   ERRO: Nao foi possivel navegar para pasta backend
    exit /b 1
)

REM Parar stack existente se houver
echo [4/4] Iniciando Supabase local...
echo   Parando stack existente (se houver)...
npx supabase stop --project-id fastproduct >nul 2>&1

REM Iniciar Supabase
echo   Iniciando stack Supabase...
npx supabase start
if %errorlevel% neq 0 (
    echo   ERRO: Falha ao iniciar Supabase
    echo   Possiveis causas:
    echo   - Portas 54321-54323 ja estao em uso
    echo   - Outro projeto Supabase esta rodando
    echo   - Problema de configuracao
    echo.
    echo   Para verificar portas em uso: netstat -ano ^| findstr :54321
    exit /b 1
)
echo   OK: Supabase iniciado com sucesso
echo.

REM Aplicar migrations
echo [5/5] Aplicando migrations...
npx supabase db push
if %errorlevel% neq 0 (
    echo   ERRO: Falha ao aplicar migrations
    echo   Verifique o SQL das migrations em backend/supabase/migrations/
    exit /b 1
)
echo   OK: Migrations aplicadas com sucesso
echo.

echo ========================================
echo   Ambiente de desenvolvimento pronto!
echo ========================================
echo.
echo   Supabase Studio: http://localhost:54323
echo   API URL: http://localhost:54321
echo   PostgreSQL: localhost:54322
echo.
echo   Para iniciar o web: npm run dev:web
echo   Para iniciar o desktop: npm run dev:desktop
echo.

cd /d "%~dp0"
endlocal
