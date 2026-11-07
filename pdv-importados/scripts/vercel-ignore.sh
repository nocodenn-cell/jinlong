#!/bin/sh
# Ignored Build Step do projeto Vercel `pdv-importados` (Root Directory = pdv-importados).
# Substitui o comando que estava só no painel:
#   if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi
#
# Contrato da Vercel: exit 0 = IGNORA o build; exit 1 = EXECUTA o build.
#
# Preview: continua sempre ignorado (mesma política de antes). As variáveis de Preview deste
# projeto apontam para o Supabase de PRODUÇÃO (ver docs/infra/VERCEL_AUDITORIA_SITE_PDV.md);
# liberar Preview do ERP exige antes um Supabase de homologação no escopo Preview.
#
# Produção: executa o build, EXCETO quando dá para provar que todo arquivo alterado desde o último
# deploy de produção (VERCEL_GIT_PREVIOUS_SHA) está numa lista fechada de caminhos que o ERP não
# lê no build. Lista de exclusão, não de inclusão: qualquer caminho fora dela (inclusive um
# diretório novo) constrói o ERP. Sem base, base inexistente ou erro do git => executa o build.
#
# `--no-renames`: um arquivo movido do ERP para docs/ precisa aparecer também pela origem.
#
# Teste: node --test scripts/vercel-pdv-ignore.test.mjs

if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "[ignore-step] ambiente ${VERCEL_ENV:-indefinido}: Preview do ERP desativado, ignorando build"
  exit 0
fi

# Base fora do clone raso da Vercel (profundidade 10; acontece depois de vários commits ignorados
# seguidos): tenta buscar só aquele commit (`git diff` precisa apenas das duas árvores). Se a busca
# falhar (o clone da Vercel pode não ter acesso ao remoto), executa o build.
ensure_commit() {
  git cat-file -e "${1}^{commit}" 2>/dev/null && return 0
  git fetch --no-tags --quiet --depth=1 origin "$1" 2>/dev/null || return 1
  git cat-file -e "${1}^{commit}" 2>/dev/null
}

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -z "$previous" ]; then
  echo "[ignore-step] produção sem VERCEL_GIT_PREVIOUS_SHA: executando build"
  exit 1
fi

if ! ensure_commit "$previous"; then
  echo "[ignore-step] commit base ${previous} indisponível: executando build"
  exit 1
fi

if ! changed=$(git diff --no-renames --name-only "$previous" HEAD 2>/dev/null); then
  echo "[ignore-step] erro do git ao comparar com ${previous}: executando build"
  exit 1
fi

if [ -z "$changed" ]; then
  echo "[ignore-step] nenhum arquivo alterado desde ${previous}: ignorando build"
  exit 0
fi

# Caminhos que comprovadamente não entram no build do ERP:
#   site/      projeto Vercel próprio (jinlong-site), isolado do ERP
#   docs/      documentação
#   .github/   workflows do GitHub Actions (não rodam na Vercel)
#   *.md na raiz do repositório
#   pdv-local/ PDV desktop (Tauri); o ERP não importa nada dele (só testes/scripts locais citam o caminho)
#   backend/   migrations/edges Supabase; o build do ERP não lê (só testes vitest leem os .sql)
#   Exceção: pdv-local/package.json e backend/package.json continuam construindo (workspaces do npm ci).
#   shared/ e shared-core/ continuam construindo (aliases @shared e @shared-core do ERP).
relevant=$(printf '%s\n' "$changed" | grep -v -E '^(site/|docs/|\.github/)|^[^/]+\.md$|^(pdv-local|backend)/' ; printf '%s\n' "$changed" | grep -E '^(pdv-local|backend)/package\.json$')
relevant=$(printf '%s\n' "$relevant" | sed '/^$/d')

if [ -z "$relevant" ]; then
  echo "[ignore-step] só site/, docs/, .github/, pdv-local/, backend/ ou *.md da raiz mudaram desde ${previous}: ignorando build"
  exit 0
fi

echo "[ignore-step] mudanças que podem afetar o ERP desde ${previous}: executando build"
printf '%s\n' "$relevant" | head -n 10 | sed 's/^/  - /'
exit 1
